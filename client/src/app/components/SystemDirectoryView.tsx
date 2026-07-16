import { useMemo, useState } from "react";
import {
  AppstoreOutlined,
  FilterOutlined,
  SearchOutlined,
  TableOutlined,
} from "@ant-design/icons";
import {
  Button,
  Empty,
  Flex,
  Input,
  Select,
  Segmented,
  Slider,
  Table,
  Tag,
  Typography,
} from "antd";

import type {
  Entity,
  Relationship,
  Source,
  SystemDataClaimCategory,
} from "../../../../shared/domain";
import { useGraphStore } from "../state/graphStore";

type DirectoryMode = "cards" | "table";
type ClaimFilterKey = Extract<SystemDataClaimCategory, "data_type" | "data_format">;

type SystemFilters = {
  status: string[];
  role: string[];
  countryCode: string[];
  disciplineFamily: string[];
  dataClaims: Record<ClaimFilterKey, string[]>;
  accessMethods: string[];
  submissionMethods: string[];
  minConfidence: number;
};

type SystemRecord = {
  entity: Entity;
  operatorName: string;
  countryCode: string;
  role: string;
  disciplineFamily: string;
  geographicScope: string;
  dataTypes: string[];
  dataFormats: string[];
  accessMethods: string[];
  submissionMethods: string[];
  identifierSchemes: string[];
  sourceTitles: string[];
  connectedNames: string[];
  relationships: Relationship[];
  searchText: string;
};

const claimFilterLabels: Record<ClaimFilterKey, string> = {
  data_type: "Data types",
  data_format: "Data formats",
};

const claimFilterKeys = Object.keys(claimFilterLabels) as ClaimFilterKey[];

const emptyFilters = (): SystemFilters => ({
  status: [],
  role: [],
  countryCode: [],
  disciplineFamily: [],
  dataClaims: {
    data_type: [],
    data_format: [],
  },
  accessMethods: [],
  submissionMethods: [],
  minConfidence: 0,
});

function labelize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function collectText(value: unknown): string[] {
  if (value == null || value === "") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectText(item));
  }

  if (typeof value === "object") {
    return Object.values(value).flatMap((child) => collectText(child));
  }

  return [String(value)];
}

function tokenScore(token: string, text: string): number | null {
  const exactIndex = text.indexOf(token);
  if (exactIndex >= 0) {
    return 100 + token.length * 3 - Math.min(exactIndex, 60) / 10;
  }

  let lastIndex = -1;
  let gapPenalty = 0;
  let run = 0;
  let bestRun = 0;

  for (const character of token) {
    const nextIndex = text.indexOf(character, lastIndex + 1);
    if (nextIndex < 0) {
      return null;
    }

    if (lastIndex >= 0) {
      gapPenalty += nextIndex - lastIndex - 1;
      run = nextIndex === lastIndex + 1 ? run + 1 : 1;
    } else {
      run = 1;
    }

    bestRun = Math.max(bestRun, run);
    lastIndex = nextIndex;
  }

  return 35 + token.length * 2 + bestRun * 5 - gapPenalty * 0.25;
}

function fuzzyScore(query: string, text: string): number | null {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return 0;
  }

  let score = 0;
  for (const token of tokens) {
    const partScore = tokenScore(token, text);
    if (partScore == null) {
      return null;
    }
    score += partScore;
  }

  return score;
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right));
}

function selectOptions(values: Array<string | null | undefined>) {
  return uniqueSorted(values).map((value) => ({
    label: labelize(value),
    value,
  }));
}

function matchesSelected(values: string[], selected: string[]): boolean {
  return selected.length === 0 || selected.includes(values[0] ?? "");
}

function matchesAny(values: string[], selected: string[]): boolean {
  return selected.length === 0 || values.some((value) => selected.includes(value));
}

function countActiveFilters(filters: SystemFilters): number {
  return [
    filters.status,
    filters.role,
    filters.countryCode,
    filters.disciplineFamily,
    filters.accessMethods,
    filters.submissionMethods,
    ...Object.values(filters.dataClaims),
  ].filter((value) => value.length > 0).length + (filters.minConfidence > 0 ? 1 : 0);
}

function claimList(record: SystemRecord, key: ClaimFilterKey): string[] {
  return key === "data_type" ? record.dataTypes : record.dataFormats;
}

function CompactTags({ values, limit = 3 }: { values: string[]; limit?: number }) {
  const visible = values.slice(0, limit);
  const remaining = values.length - visible.length;

  if (values.length === 0) {
    return <Typography.Text type="secondary">None recorded</Typography.Text>;
  }

  return (
    <Flex gap={4} wrap>
      {visible.map((value) => (
        <Tag key={value} bordered={false}>
          {labelize(value)}
        </Tag>
      ))}
      {remaining > 0 ? <Tag bordered={false}>+{remaining}</Tag> : null}
    </Flex>
  );
}

export function SystemDirectoryView() {
  const graph = useGraphStore((state) => state.graph);
  const selectedEntityId = useGraphStore((state) => state.selectedEntityId);
  const setSelectedEntityId = useGraphStore((state) => state.setSelectedEntityId);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mode, setMode] = useState<DirectoryMode>("cards");
  const [filters, setFilters] = useState<SystemFilters>(() => emptyFilters());

  const records = useMemo<SystemRecord[]>(() => {
    if (!graph) {
      return [];
    }

    return graph.entities
      .filter((entity) => entity.kind === "system")
      .map((entity) => {
        const relationshipIds = [
          ...(graph.outgoingByEntityId[entity.id] ?? []),
          ...(graph.incomingByEntityId[entity.id] ?? []),
        ];
        const relationships = relationshipIds.map(
          (relationshipId) => graph.relationshipById[relationshipId],
        );
        const operatorRelationship = relationships.find(
          (relationship) => relationship?.type === "operates",
        );
        const operator = operatorRelationship
          ? graph.entityById[operatorRelationship.sourceEntityId]
          : null;
        const profile = graph.systemProfileBySystemId[entity.id];
        const claims = graph.systemDataClaimsBySystemId[entity.id] ?? [];
        const accessPaths = graph.systemAccessPathsBySystemId[entity.id] ?? [];
        const submissionPaths = graph.systemSubmissionPathsBySystemId[entity.id] ?? [];
        const identifierSchemes =
          graph.systemIdentifierSchemesBySystemId[entity.id] ?? [];
        const sourceLinks = graph.entitySourcesByEntityId[entity.id] ?? [];
        const relationshipSourceLinks = relationships.flatMap(
          (relationship) =>
            graph.relationshipSourcesByRelationshipId[relationship.id] ?? [],
        );
        const sources = [...sourceLinks, ...relationshipSourceLinks]
          .map((sourceLink) => graph.sourceById[sourceLink.sourceId])
          .filter((source): source is Source => Boolean(source));
        const connectedNames = relationships
          .flatMap((relationship) => [
            graph.entityById[relationship.sourceEntityId]?.name,
            graph.entityById[relationship.targetEntityId]?.name,
          ])
          .filter((name): name is string => Boolean(name) && name !== entity.name);
        const dataTypes = uniqueSorted(
          claims
            .filter((claim) => claim.category === "data_type")
            .map((claim) => claim.label),
        );
        const dataFormats = uniqueSorted(
          claims
            .filter((claim) => claim.category === "data_format")
            .map((claim) => claim.label),
        );
        const accessMethods = uniqueSorted(accessPaths.map((path) => path.label));
        const submissionMethods = uniqueSorted(submissionPaths.map((path) => path.label));
        const searchText = normalize(
          [
            entity.name,
            entity.status,
            entity.countryCode,
            entity.description,
            operator?.name,
            operator?.countryCode,
            profile?.role,
            profile?.primaryUrl,
            profile?.aliases,
            profile?.disciplineFamily,
            profile?.geographicScope,
            profile?.dataSummary,
            profile?.accessSummary,
            profile?.submissionSummary,
            ...claims.flatMap((claim) => collectText([claim.category, claim.label, claim.note])),
            ...accessPaths.flatMap((path) => collectText([path.method, path.label, path.url, path.note])),
            ...submissionPaths.flatMap((path) => collectText([path.method, path.label, path.url, path.note])),
            ...identifierSchemes.flatMap((scheme) => collectText([scheme.scheme, scheme.appliesTo, scheme.note])),
            ...sources.flatMap((source) => collectText([source.title, source.publisher, source.note, source.url])),
            ...relationships.flatMap((relationship) => collectText([relationship.type, relationship.note])),
            ...connectedNames,
          ].join(" "),
        );

        return {
          entity,
          operatorName: operator?.name ?? "",
          countryCode: operator?.countryCode ?? entity.countryCode ?? "",
          role: profile?.role ?? "",
          disciplineFamily: profile?.disciplineFamily ?? "",
          geographicScope: profile?.geographicScope ?? "",
          dataTypes,
          dataFormats,
          accessMethods,
          submissionMethods,
          identifierSchemes: uniqueSorted(identifierSchemes.map((scheme) => scheme.scheme)),
          sourceTitles: uniqueSorted(sources.map((source) => source.title)),
          connectedNames: uniqueSorted(connectedNames),
          relationships,
          searchText,
        };
      })
      .sort((left, right) => left.entity.name.localeCompare(right.entity.name));
  }, [graph]);

  const filterOptions = useMemo(
    () => ({
      status: selectOptions(records.map((record) => record.entity.status)),
      role: selectOptions(records.map((record) => record.role)),
      countryCode: selectOptions(records.map((record) => record.countryCode)),
      disciplineFamily: selectOptions(records.map((record) => record.disciplineFamily)),
      dataClaims: {
        data_type: selectOptions(records.flatMap((record) => record.dataTypes)),
        data_format: selectOptions(records.flatMap((record) => record.dataFormats)),
      },
      accessMethods: selectOptions(records.flatMap((record) => record.accessMethods)),
      submissionMethods: selectOptions(
        records.flatMap((record) => record.submissionMethods),
      ),
    }),
    [records],
  );

  const filteredRecords = useMemo(() => {
    const ranked = records
      .flatMap((record) => {
        const score = fuzzyScore(query, record.searchText);
        return score == null ? [] : [{ record, score }];
      })
      .filter(({ record }) => {
        return (
          matchesSelected([record.entity.status], filters.status) &&
          matchesSelected([record.role], filters.role) &&
          matchesSelected([record.countryCode], filters.countryCode) &&
          matchesSelected([record.disciplineFamily], filters.disciplineFamily) &&
          matchesAny(record.accessMethods, filters.accessMethods) &&
          matchesAny(record.submissionMethods, filters.submissionMethods) &&
          record.entity.confidence >= filters.minConfidence &&
          claimFilterKeys.every((key) =>
            matchesAny(claimList(record, key), filters.dataClaims[key]),
          )
        );
      });

    return ranked
      .sort((left, right) => {
        if (query.trim()) {
          return right.score - left.score;
        }
        return left.record.entity.name.localeCompare(right.record.entity.name);
      })
      .map(({ record }) => record);
  }, [filters, query, records]);

  const activeFilterCount = countActiveFilters(filters);

  function patchFilters(patch: Partial<SystemFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function patchClaimFilter(key: ClaimFilterKey, values: string[]) {
    setFilters((current) => ({
      ...current,
      dataClaims: {
        ...current.dataClaims,
        [key]: values,
      },
    }));
  }

  function selectSystem(record: SystemRecord) {
    setSelectedEntityId(record.entity.id);
  }

  const columns = [
    {
      title: "System",
      key: "system",
      render: (_: unknown, record: SystemRecord) => (
        <Flex vertical gap={2}>
          <Typography.Text strong>{record.entity.name}</Typography.Text>
          <Typography.Text type="secondary">{record.entity.description}</Typography.Text>
        </Flex>
      ),
    },
    {
      title: "Operator",
      dataIndex: "operatorName",
      key: "operatorName",
      render: (value: string) =>
        value || <Typography.Text type="secondary">Unknown</Typography.Text>,
    },
    {
      title: "Role",
      key: "role",
      render: (_: unknown, record: SystemRecord) =>
        record.role ? <Tag>{labelize(record.role)}</Tag> : <Typography.Text type="secondary">Not set</Typography.Text>,
    },
    {
      title: "Data",
      key: "data",
      render: (_: unknown, record: SystemRecord) => (
        <CompactTags values={[...record.dataTypes, ...record.dataFormats]} limit={4} />
      ),
    },
    {
      title: "Access",
      key: "access",
      render: (_: unknown, record: SystemRecord) => (
        <CompactTags values={record.accessMethods} limit={4} />
      ),
    },
    {
      title: "Status",
      key: "status",
      render: (_: unknown, record: SystemRecord) => (
        <Tag color={record.entity.status === "active" ? "green" : "default"}>
          {record.entity.status}
        </Tag>
      ),
    },
    {
      title: "Confidence",
      key: "confidence",
      width: 110,
      render: (_: unknown, record: SystemRecord) => record.entity.confidence.toFixed(2),
    },
  ];

  if (!graph) {
    return null;
  }

  return (
    <div className="systems-directory">
      <Flex vertical gap={16}>
        <Flex align="center" justify="space-between" gap={12} wrap>
          <Flex vertical gap={2}>
            <Typography.Title level={2}>Systems</Typography.Title>
            <Typography.Text type="secondary">
              {filteredRecords.length} of {records.length} systems
            </Typography.Text>
          </Flex>
          <Segmented
            value={mode}
            options={[
              { label: "Cards", value: "cards", icon: <AppstoreOutlined /> },
              { label: "Table", value: "table", icon: <TableOutlined /> },
            ]}
            onChange={(value) => setMode(value as DirectoryMode)}
          />
        </Flex>

        <Flex align="center" gap={8} wrap>
          <Input
            allowClear
            className="systems-search"
            placeholder="Search systems, data, access methods, sources"
            prefix={<SearchOutlined />}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button
            icon={<FilterOutlined />}
            type={filtersOpen ? "primary" : "default"}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Button>
          {activeFilterCount > 0 ? (
            <Button onClick={() => setFilters(emptyFilters())}>Reset</Button>
          ) : null}
        </Flex>

        {filtersOpen ? (
          <div className="systems-filter-panel">
            <div className="systems-filter-grid">
              <Select
                allowClear
                mode="multiple"
                maxTagCount="responsive"
                placeholder="Status"
                value={filters.status}
                options={filterOptions.status}
                onChange={(value) => patchFilters({ status: value })}
              />
              <Select
                allowClear
                mode="multiple"
                maxTagCount="responsive"
                placeholder="Role"
                value={filters.role}
                options={filterOptions.role}
                onChange={(value) => patchFilters({ role: value })}
              />
              <Select
                allowClear
                mode="multiple"
                maxTagCount="responsive"
                placeholder="Operator country"
                value={filters.countryCode}
                options={filterOptions.countryCode}
                onChange={(value) => patchFilters({ countryCode: value })}
              />
              <Select
                allowClear
                mode="multiple"
                maxTagCount="responsive"
                placeholder="Discipline"
                value={filters.disciplineFamily}
                options={filterOptions.disciplineFamily}
                onChange={(value) => patchFilters({ disciplineFamily: value })}
              />
              {claimFilterKeys.map((key) => (
                <Select
                  key={key}
                  allowClear
                  mode="multiple"
                  maxTagCount="responsive"
                  placeholder={claimFilterLabels[key]}
                  value={filters.dataClaims[key]}
                  options={filterOptions.dataClaims[key]}
                  onChange={(value) => patchClaimFilter(key, value)}
                />
              ))}
              <Select
                allowClear
                mode="multiple"
                maxTagCount="responsive"
                placeholder="Access methods"
                value={filters.accessMethods}
                options={filterOptions.accessMethods}
                onChange={(value) => patchFilters({ accessMethods: value })}
              />
              <Select
                allowClear
                mode="multiple"
                maxTagCount="responsive"
                placeholder="Submission methods"
                value={filters.submissionMethods}
                options={filterOptions.submissionMethods}
                onChange={(value) => patchFilters({ submissionMethods: value })}
              />
              <Flex vertical gap={4} className="systems-confidence-filter">
                <Typography.Text type="secondary">
                  Minimum confidence: {filters.minConfidence.toFixed(2)}
                </Typography.Text>
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={filters.minConfidence}
                  onChange={(value) => patchFilters({ minConfidence: value })}
                />
              </Flex>
            </div>
          </div>
        ) : null}

        {filteredRecords.length === 0 ? (
          <Empty description="No systems match the current search and filters." />
        ) : mode === "cards" ? (
          <div className="systems-card-grid">
            {filteredRecords.map((record) => (
              <button
                key={record.entity.id}
                className={
                  record.entity.id === selectedEntityId
                    ? "systems-card is-selected"
                    : "systems-card"
                }
                type="button"
                onClick={() => selectSystem(record)}
              >
                <Flex vertical gap={12}>
                  <Flex align="flex-start" justify="space-between" gap={8}>
                    <Flex vertical gap={2}>
                      <Typography.Text strong>{record.entity.name}</Typography.Text>
                      <Typography.Text type="secondary">
                        {record.operatorName || "Unknown operator"}
                      </Typography.Text>
                    </Flex>
                    <Tag color={record.entity.status === "active" ? "green" : "default"}>
                      {record.entity.status}
                    </Tag>
                  </Flex>
                  {record.entity.description ? (
                    <Typography.Paragraph className="systems-card-description">
                      {record.entity.description}
                    </Typography.Paragraph>
                  ) : null}
                  <div className="systems-card-meta">
                    <span>{record.countryCode || "No operator country"}</span>
                    <span>{record.role ? labelize(record.role) : "No role"}</span>
                    <span>
                      {record.disciplineFamily
                        ? labelize(record.disciplineFamily)
                        : "No discipline"}
                    </span>
                    <span>{record.relationships.length} relationships</span>
                  </div>
                  <Flex vertical gap={8}>
                    <CompactTags values={record.dataTypes} />
                    <CompactTags values={record.accessMethods} />
                  </Flex>
                  <Flex align="center" justify="space-between" gap={8}>
                    <Typography.Text type="secondary">
                      {record.sourceTitles.length} sources
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      confidence {record.entity.confidence.toFixed(2)}
                    </Typography.Text>
                  </Flex>
                </Flex>
              </button>
            ))}
          </div>
        ) : (
          <Table
            className="systems-table"
            columns={columns}
            dataSource={filteredRecords}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            rowClassName={(record) =>
              record.entity.id === selectedEntityId ? "is-selected" : ""
            }
            rowKey={(record) => record.entity.id}
            size="middle"
            onRow={(record) => ({
              onClick: () => selectSystem(record),
            })}
          />
        )}
      </Flex>
    </div>
  );
}
