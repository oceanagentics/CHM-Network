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
  claimFilterLabel,
  countActiveFilters,
  getSystemFilterOptions,
  localizationCoverageFilterOptions,
  resolveGraphSearch,
  reviewStateFilterOptions,
  type ClaimFilterKey,
  type GraphSearchFilters,
  type SearchMatchReason,
  type SystemSearchRecord,
} from "../search";
import { facetLabel, localeName, t, type FacetGroup } from "../i18n";
import { useGraphStore } from "../state/graphStore";

type DirectoryMode = "cards" | "table";
type SystemDirectoryVariant = "page" | "rail";

function CompactTags({
  values,
  limit = 3,
  facetGroup,
}: {
  values: string[];
  limit?: number;
  facetGroup?: FacetGroup;
}) {
  const locale = useGraphStore((state) => state.locale);
  const visible = values.slice(0, limit);
  const remaining = values.length - visible.length;

  if (values.length === 0) {
    return <Typography.Text type="secondary">{t(locale, "directory.noneRecorded")}</Typography.Text>;
  }

  return (
    <Flex gap={4} wrap>
      {visible.map((value) => (
        <Tag key={value} bordered={false}>
          {facetGroup ? facetLabel(locale, facetGroup, value) : value}
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

  function formatReasonValue(value: string): string {
    return value.length > 92 ? `${value.slice(0, 89)}...` : value;
  }

  return (
    <Typography.Text type="secondary">
      {reasons
        .slice(0, 2)
        .map((reason) => `${reason.label}: ${formatReasonValue(reason.value)}`)
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
  const locale = useGraphStore((state) => state.locale);
  const searchAllLanguages = useGraphStore((state) => state.searchAllLanguages);
  const setSelectedEntityId = useGraphStore((state) => state.setSelectedEntityId);
  const query = useGraphStore((state) => state.searchQuery);
  const filters = useGraphStore((state) => state.searchFilters);
  const setSearchQuery = useGraphStore((state) => state.setSearchQuery);
  const setSearchAllLanguages = useGraphStore((state) => state.setSearchAllLanguages);
  const setSearchFilters = useGraphStore((state) => state.setSearchFilters);
  const resetSearchFilters = useGraphStore((state) => state.resetSearchFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mode, setMode] = useState<DirectoryMode>("cards");

  const resolvedSearch = useMemo(
    () => (graph
      ? resolveGraphSearch(
          graph,
          { query, filters, searchAllLanguages },
          locale,
        )
      : null),
    [filters, graph, locale, query, searchAllLanguages],
  );
  const records = resolvedSearch?.systemRecords ?? [];
  const filteredRecords = resolvedSearch?.filteredSystemRecords ?? [];
  const filterOptions = useMemo(
    () => getSystemFilterOptions(records, locale),
    [locale, records],
  );

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
      title: t(locale, "directory.system"),
      key: "system",
      render: (_: unknown, record: SystemSearchRecord) => (
        <Flex vertical gap={2}>
          <Typography.Text strong>{record.title}</Typography.Text>
          <Typography.Text type="secondary">
            {record.summary}
          </Typography.Text>
          {record.localization.isLocaleFallback ? (
            <Tag bordered={false}>
              {record.localization.displayLocale
                ? t(locale, "common.showingLocale", {
                    locale: localeName(record.localization.displayLocale, locale),
                  })
                : t(locale, "common.noLocalization")}
            </Tag>
          ) : null}
          <MatchReasons reasons={record.matchReasons} />
        </Flex>
      ),
    },
    {
      title: t(locale, "directory.operator"),
      dataIndex: "operatorName",
      key: "operatorName",
      render: (value: string) =>
        value || <Typography.Text type="secondary">{t(locale, "directory.unknown")}</Typography.Text>,
    },
    {
      title: t(locale, "directory.localization"),
      key: "localization",
      render: (_: unknown, record: SystemSearchRecord) => (
        <Flex gap={4} wrap>
          <Tag bordered={false}>
            {record.hasCurrentLocale
              ? localeName(locale, locale)
              : t(locale, "common.missingLocale", { locale: localeName(locale, locale) })}
          </Tag>
          {record.currentLocaleReviewState ? (
            <Tag bordered={false}>{facetLabel(locale, "reviewState", record.currentLocaleReviewState)}</Tag>
          ) : null}
        </Flex>
      ),
    },
    {
      title: t(locale, "directory.role"),
      key: "role",
      render: (_: unknown, record: SystemSearchRecord) =>
        record.role
          ? <Tag>{facetLabel(locale, "systemRole", record.role)}</Tag>
          : <Typography.Text type="secondary">{t(locale, "directory.notSet")}</Typography.Text>,
    },
    {
      title: t(locale, "directory.data"),
      key: "data",
      render: (_: unknown, record: SystemSearchRecord) => (
        <CompactTags
          values={[...record.dataTypes, ...record.dataFormats, ...record.dataStandards]}
          limit={4}
          facetGroup="descriptorLabel"
        />
      ),
    },
    {
      title: t(locale, "directory.access"),
      key: "access",
      render: (_: unknown, record: SystemSearchRecord) => (
        <CompactTags values={record.accessLabels} limit={4} />
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
              <Typography.Title level={isRail ? 4 : 2}>{t(locale, "directory.systems")}</Typography.Title>
            ) : null}
            <Typography.Text type="secondary">
              {t(locale, "directory.systemCount", {
                filtered: filteredRecords.length,
                total: records.length,
              })}
            </Typography.Text>
          </Flex>
          <Segmented
            value={mode}
            options={[
              { label: t(locale, "directory.cards"), value: "cards", icon: <AppstoreOutlined /> },
              { label: t(locale, "directory.table"), value: "table", icon: <TableOutlined /> },
            ]}
            onChange={(value) => setMode(value as DirectoryMode)}
          />
        </Flex>

        <Flex className="systems-controls" align="center" gap={8} wrap>
          <Input
            allowClear
            className="systems-search"
            placeholder={t(locale, "directory.searchPlaceholder")}
            prefix={<SearchOutlined />}
            value={query}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <Segmented
            value={searchAllLanguages ? "all" : "displayed"}
            options={[
              { label: t(locale, "directory.displayed"), value: "displayed" },
              { label: t(locale, "directory.allLanguages"), value: "all" },
            ]}
            onChange={(value) => setSearchAllLanguages(value === "all")}
          />
          <Button
            block={isRail}
            icon={<FilterOutlined />}
            type={filtersOpen ? "primary" : "default"}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {activeFilterCount > 0
              ? t(locale, "directory.filtersCount", { count: activeFilterCount })
              : t(locale, "directory.filters")}
          </Button>
          {activeFilterCount > 0 ? (
            <Button block={isRail} onClick={resetSearchFilters}>
              {t(locale, "directory.reset")}
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
                placeholder={t(locale, "directory.languageCoverage")}
                value={filters.localizationCoverage}
                options={localizationCoverageFilterOptions(locale)}
                onChange={(value) => patchFilters({ localizationCoverage: value })}
              />
              <Select
                allowClear
                mode="multiple"
                maxTagCount="responsive"
                placeholder={t(locale, "directory.reviewStatus")}
                value={filters.reviewState}
                options={reviewStateFilterOptions(locale)}
                onChange={(value) => patchFilters({ reviewState: value })}
              />
              <Select
                allowClear
                mode="multiple"
                maxTagCount="responsive"
                placeholder={t(locale, "directory.role")}
                value={filters.role}
                options={filterOptions.role}
                onChange={(value) => patchFilters({ role: value })}
              />
              <Select
                allowClear
                mode="multiple"
                maxTagCount="responsive"
                placeholder={t(locale, "directory.operatorCountry")}
                value={filters.countryCode}
                options={filterOptions.countryCode}
                onChange={(value) => patchFilters({ countryCode: value })}
              />
              <Select
                allowClear
                mode="multiple"
                maxTagCount="responsive"
                placeholder={t(locale, "details.discipline")}
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
                  placeholder={claimFilterLabel(locale, key)}
                  value={filters.dataClaims[key]}
                  options={filterOptions.dataClaims[key]}
                  onChange={(value) => patchClaimFilter(key, value)}
                />
              ))}
              <Select
                allowClear
                mode="multiple"
                maxTagCount="responsive"
                placeholder={t(locale, "directory.accessTypes")}
                value={filters.accessTypes}
                options={filterOptions.accessTypes}
                onChange={(value) => patchFilters({ accessTypes: value })}
              />
              <Select
                allowClear
                mode="multiple"
                maxTagCount="responsive"
                placeholder={t(locale, "directory.accessMethods")}
                value={filters.accessMethods}
                options={filterOptions.accessMethods}
                onChange={(value) => patchFilters({ accessMethods: value })}
              />
            </div>
          </div>
        ) : null}

        {filteredRecords.length === 0 ? (
          <Empty description={t(locale, "directory.noSystemsMatch")} />
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
                      <Typography.Text strong>{record.title}</Typography.Text>
                      <Typography.Text type="secondary">
                        {record.operatorName || t(locale, "directory.unknownOperator")}
                      </Typography.Text>
                    </Flex>
                    {record.localization.isLocaleFallback ? (
                      <Tag bordered={false}>
                        {record.localization.displayLocale
                          ? t(locale, "common.showingLocale", {
                              locale: localeName(record.localization.displayLocale, locale),
                            })
                          : t(locale, "common.noLocalization")}
                      </Tag>
                    ) : null}
                    <Tag bordered={false}>
                      {record.hasCurrentLocale
                        ? localeName(locale, locale)
                        : t(locale, "common.missingLocale", { locale: localeName(locale, locale) })}
                    </Tag>
                    {record.currentLocaleReviewState ? (
                      <Tag bordered={false}>{facetLabel(locale, "reviewState", record.currentLocaleReviewState)}</Tag>
                    ) : null}
                  </Flex>
                  {record.summary ? (
                    <Typography.Paragraph className="systems-card-description">
                      {record.summary}
                    </Typography.Paragraph>
                  ) : null}
                  <MatchReasons reasons={record.matchReasons} />
                  <div className="systems-card-meta">
                    <span>{record.countryCode || t(locale, "directory.noOperatorCountry")}</span>
                    <span>
                      {record.role
                        ? facetLabel(locale, "systemRole", record.role)
                        : t(locale, "directory.noRole")}
                    </span>
                    <span>
                      {record.disciplineFamily
                        ? facetLabel(locale, "disciplineFamily", record.disciplineFamily)
                        : t(locale, "directory.noDiscipline")}
                    </span>
                    <span>
                      {t(locale, "directory.relationshipCount", {
                        count: record.relationships.length,
                      })}
                    </span>
                  </div>
                  <Flex vertical gap={8}>
                    <CompactTags values={record.dataTypes} facetGroup="descriptorLabel" />
                    <CompactTags values={record.accessLabels} />
                  </Flex>
                  <Flex align="center" justify="space-between" gap={8}>
                    <Typography.Text type="secondary">
                      {t(locale, "directory.sourceCount", {
                        count: record.sourceTitles.length,
                      })}
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
