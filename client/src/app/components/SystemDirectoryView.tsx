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
  Table,
  Tag,
  Typography,
} from "antd";

import {
  claimFilterKeys,
  claimFilterLabels,
  countActiveFilters,
  getSystemFilterOptions,
  labelize,
  resolveGraphSearch,
  type ClaimFilterKey,
  type GraphSearchFilters,
  type SearchMatchReason,
  type SystemSearchRecord,
} from "../search";
import { useGraphStore } from "../state/graphStore";

type DirectoryMode = "cards" | "table";
type SystemDirectoryVariant = "page" | "rail";

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

function MatchReasons({ reasons }: { reasons: SearchMatchReason[] }) {
  if (reasons.length === 0) {
    return null;
  }

  return (
    <Typography.Text type="secondary">
      {reasons
        .slice(0, 2)
        .map((reason) => `${reason.label}: ${reason.value}`)
        .join(" · ")}
    </Typography.Text>
  );
}

export function SystemDirectoryView({
  onSelectSystem,
  showTitle = true,
  variant = "page",
}: {
  onSelectSystem?: (systemId: string) => void;
  showTitle?: boolean;
  variant?: SystemDirectoryVariant;
}) {
  const graph = useGraphStore((state) => state.graph);
  const selectedEntityId = useGraphStore((state) => state.selectedEntityId);
  const setSelectedEntityId = useGraphStore((state) => state.setSelectedEntityId);
  const query = useGraphStore((state) => state.searchQuery);
  const filters = useGraphStore((state) => state.searchFilters);
  const setSearchQuery = useGraphStore((state) => state.setSearchQuery);
  const setSearchFilters = useGraphStore((state) => state.setSearchFilters);
  const resetSearchFilters = useGraphStore((state) => state.resetSearchFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mode, setMode] = useState<DirectoryMode>("cards");

  const resolvedSearch = useMemo(
    () => (graph ? resolveGraphSearch(graph, { query, filters }) : null),
    [filters, graph, query],
  );
  const records = resolvedSearch?.systemRecords ?? [];
  const filteredRecords = resolvedSearch?.filteredSystemRecords ?? [];
  const filterOptions = useMemo(() => getSystemFilterOptions(records), [records]);

  const activeFilterCount = countActiveFilters(filters);
  const isRail = variant === "rail";
  const displayMode: DirectoryMode = mode;

  function patchFilters(patch: Partial<GraphSearchFilters>) {
    setSearchFilters({ ...filters, ...patch });
  }

  function patchClaimFilter(key: ClaimFilterKey, values: string[]) {
    setSearchFilters({
      ...filters,
      dataClaims: {
        ...filters.dataClaims,
        [key]: values,
      },
    });
  }

  function selectSystem(record: SystemSearchRecord) {
    setSelectedEntityId(record.entity.id);
    onSelectSystem?.(record.entity.id);
  }

  const columns = [
    {
      title: "System",
      key: "system",
      render: (_: unknown, record: SystemSearchRecord) => (
        <Flex vertical gap={2}>
          <Typography.Text strong>{record.entity.name}</Typography.Text>
          <Typography.Text type="secondary">
            {record.system.shortDescription}
          </Typography.Text>
          <MatchReasons reasons={record.matchReasons} />
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
      render: (_: unknown, record: SystemSearchRecord) =>
        record.role ? <Tag>{labelize(record.role)}</Tag> : <Typography.Text type="secondary">Not set</Typography.Text>,
    },
    {
      title: "Data",
      key: "data",
      render: (_: unknown, record: SystemSearchRecord) => (
        <CompactTags values={[...record.dataTypes, ...record.dataFormats]} limit={4} />
      ),
    },
    {
      title: "Access",
      key: "access",
      render: (_: unknown, record: SystemSearchRecord) => (
        <CompactTags values={record.accessMethods} limit={4} />
      ),
    },
  ];

  if (!graph) {
    return null;
  }

  return (
    <div className={isRail ? "systems-directory systems-directory-rail" : "systems-directory"}>
      <Flex vertical gap={16}>
        <Flex align="center" justify="space-between" gap={12} wrap>
          <Flex vertical gap={2} className="systems-directory-summary">
            {showTitle ? (
              <Typography.Title level={isRail ? 4 : 2}>Systems</Typography.Title>
            ) : null}
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

        <Flex className="systems-controls" align="center" gap={8} wrap>
          <Input
            allowClear
            className="systems-search"
            placeholder="Search nodes, systems, data, access methods, sources"
            prefix={<SearchOutlined />}
            value={query}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <Button
            block={isRail}
            icon={<FilterOutlined />}
            type={filtersOpen ? "primary" : "default"}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Button>
          {activeFilterCount > 0 ? (
            <Button block={isRail} onClick={resetSearchFilters}>
              Reset
            </Button>
          ) : null}
        </Flex>

        {filtersOpen ? (
          <div className="systems-filter-panel">
            <div className="systems-filter-grid">
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
            </div>
          </div>
        ) : null}

        {filteredRecords.length === 0 ? (
          <Empty description="No systems match the current search and filters." />
        ) : displayMode === "cards" ? (
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
                  </Flex>
                  {record.system.shortDescription ? (
                    <Typography.Paragraph className="systems-card-description">
                      {record.system.shortDescription}
                    </Typography.Paragraph>
                  ) : null}
                  <MatchReasons reasons={record.matchReasons} />
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
            scroll={isRail ? { x: 920 } : undefined}
            size={isRail ? "small" : "middle"}
            onRow={(record) => ({
              onClick: () => selectSystem(record),
            })}
          />
        )}
      </Flex>
    </div>
  );
}
