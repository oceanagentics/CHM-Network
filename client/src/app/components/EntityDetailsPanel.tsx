import { useEffect, useState, type ReactNode } from "react";
import {
  CloseOutlined,
  InfoCircleOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Flex,
  Input,
  List,
  Select,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";

import type {
  GraphEdge,
  GraphNode,
  ReviewState,
  RyuRoute,
  SourceRef,
  SupportedLocale,
  SystemDataDescriptorCategory,
} from "../../../../shared/domain";
import { updateNodeLocalizationReview } from "../api";
import { appPath, canReviewNodes } from "../config";
import {
  facetLabel,
  formatDateTime,
  formatNumber,
  humanizeCode,
  localeName,
  t,
} from "../i18n";
import {
  operatorNodesForSystem,
  parentSystemNodeForSystem,
} from "../graph/indexGraph";
import {
  localizedMetricById,
  nodeTitle,
  resolveMetric,
  resolveNodeDisplay,
  systemAccessPaths,
  systemDataDescriptors,
  systemGallery,
  type ResolvedSourcedMetric,
  type ResolvedSystemAccessPath,
  type ResolvedSystemDataDescriptor,
  type ResolvedSystemGalleryItem,
} from "../localization";
import { useGraphStore } from "../state/graphStore";

type DetailTabKey = "user" | "raw";

function tagColor(value: string): string | undefined {
  if (value === "rich" || value === "human_reviewed") {
    return "green";
  }
  if (value === "thin" || value === "agent_researched") {
    return "blue";
  }
  if (value === "needs_revision") {
    return "red";
  }

  return undefined;
}

function resolveGalleryUrl(url: string): string {
  if (/^(?:[a-z][a-z\d+\-.]*:|\/\/)/i.test(url)) {
    return url;
  }

  return url.startsWith("/") ? appPath(url) : url;
}

const reviewStates: ReviewState[] = [
  "agent_researched",
  "human_reviewed",
  "needs_revision",
];

function InlineField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="entity-detail-item">
      <Typography.Text className="entity-detail-label">{label}</Typography.Text>
      <div className="entity-detail-value">{children}</div>
    </div>
  );
}

function EmptyValue({ children }: { children?: ReactNode }) {
  const locale = useGraphStore((state) => state.locale);
  return <Typography.Text type="secondary">{children ?? t(locale, "common.notRecorded")}</Typography.Text>;
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="entity-detail-section">
      <Typography.Text strong>{title}</Typography.Text>
      {children}
    </section>
  );
}

function SourceLink({ source }: { source: SourceRef }) {
  const locale = useGraphStore((state) => state.locale);
  const fullSource = useGraphStore((state) => state.graph?.sourceById[source.id]);
  const sourceUrl = fullSource?.url ?? source.url;
  const tooltip = fullSource ? (
    <Flex className="source-record-tooltip" vertical gap={2}>
      <Typography.Text strong>{fullSource.title}</Typography.Text>
      <Typography.Text>{t(locale, "source.id")}: {fullSource.id}</Typography.Text>
      <Typography.Text>
        {t(locale, "source.type")}: {facetLabel(locale, "sourceType", fullSource.sourceType)}
      </Typography.Text>
      {fullSource.publisher ? (
        <Typography.Text>{t(locale, "source.publisher")}: {fullSource.publisher}</Typography.Text>
      ) : null}
      {fullSource.publishedAt ? (
        <Typography.Text>{t(locale, "source.published")}: {fullSource.publishedAt}</Typography.Text>
      ) : null}
      {fullSource.accessedAt ? (
        <Typography.Text>{t(locale, "source.accessed")}: {fullSource.accessedAt}</Typography.Text>
      ) : null}
      {fullSource.url ? (
        <Typography.Text>{t(locale, "source.url")}: {fullSource.url}</Typography.Text>
      ) : null}
      {fullSource.localPath ? (
        <Typography.Text>{t(locale, "source.localPath")}: {fullSource.localPath}</Typography.Text>
      ) : null}
      {fullSource.note ? <Typography.Text>{fullSource.note}</Typography.Text> : null}
    </Flex>
  ) : (
    t(locale, "source.notLoaded", { id: source.id })
  );

  return (
    <span className="source-record-link">
      <Typography.Link href={sourceUrl} target="_blank" rel="noreferrer">
        {source.title}
      </Typography.Link>
      <Tooltip title={tooltip}>
        <InfoCircleOutlined className="source-record-info-icon" />
      </Tooltip>
    </span>
  );
}

function descriptorList(
  descriptors: ResolvedSystemDataDescriptor[],
  category: SystemDataDescriptorCategory,
) {
  return descriptors.filter((descriptor) => descriptor.category === category);
}

function DescriptorTags({ descriptors }: { descriptors: ResolvedSystemDataDescriptor[] }) {
  const locale = useGraphStore((state) => state.locale);

  if (descriptors.length === 0) {
    return <EmptyValue />;
  }

  return (
    <Flex gap={4} wrap>
      {descriptors.map((descriptor) => (
        <Tag key={descriptor.id} bordered={false}>
          {descriptor.localizedLabel ?? facetLabel(locale, "descriptorLabel", descriptor.label)}
        </Tag>
      ))}
    </Flex>
  );
}

function formatBytes(value: number, locale: SupportedLocale) {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
  }).format(size)} ${units[unitIndex]}`;
}

function formatMetricValue(metric: ResolvedSourcedMetric, locale: SupportedLocale) {
  if (metric.key === "storage_size_bytes" || metric.unit === "bytes") {
    return formatBytes(metric.value, locale);
  }

  return `${formatNumber(metric.value, locale)} ${facetLabel(locale, "unit", metric.unit)}`;
}

function MetricValue({ metric }: { metric: ResolvedSourcedMetric | null }) {
  const locale = useGraphStore((state) => state.locale);
  if (!metric) {
    return <EmptyValue />;
  }

  return (
    <Flex vertical gap={2}>
      <Typography.Text>{formatMetricValue(metric, locale)}</Typography.Text>
      {metric.description ? (
        <Typography.Text type="secondary">{metric.description}</Typography.Text>
      ) : null}
      <Typography.Text type="secondary">
        {t(locale, "common.source")}: <SourceLink source={metric.source} />
        {metric.observedAt
          ? ` · ${t(locale, "common.observed", { date: metric.observedAt })}`
          : ""}
      </Typography.Text>
    </Flex>
  );
}

function AccessDescription({ path }: { path: ResolvedSystemAccessPath }) {
  const locale = useGraphStore((state) => state.locale);
  const label = path.label === path.method
    ? facetLabel(locale, "accessMethod", path.method)
    : path.label;

  return (
    <Flex vertical gap={4}>
      <Flex align="center" gap={6} wrap>
        <Typography.Text>{label}</Typography.Text>
        <Tag bordered={false}>{facetLabel(locale, "accessType", path.type)}</Tag>
        <Tag bordered={false}>{facetLabel(locale, "accessMethod", path.method)}</Tag>
      </Flex>
      <Typography.Text type="secondary">{path.description}</Typography.Text>
      <Typography.Link href={path.url} target="_blank" rel="noreferrer">
        {path.url}
      </Typography.Link>
      <Typography.Text type="secondary">
        {t(locale, "common.source")}: <SourceLink source={path.source} />
      </Typography.Text>
    </Flex>
  );
}

function RyuRouteDescription({ route }: { route: RyuRoute }) {
  const locale = useGraphStore((state) => state.locale);

  return (
    <Flex vertical gap={4}>
      <Flex align="center" gap={6} wrap>
        <Typography.Text>{route.id}</Typography.Text>
        <Tag bordered={false}>{humanizeCode(route.status)}</Tag>
        <Tag bordered={false}>{humanizeCode(route.mode)}</Tag>
        <Tag bordered={false}>{t(locale, "details.priority", { priority: route.priority })}</Tag>
        {route.capabilities.map((capability) => (
          <Tag key={capability} bordered={false}>{humanizeCode(capability)}</Tag>
        ))}
      </Flex>
      {route.target ? (
        <Typography.Text type="secondary">{t(locale, "details.target")}: {route.target}</Typography.Text>
      ) : null}
      {route.upstream ? (
        <Typography.Text type="secondary">{t(locale, "details.upstream")}: {route.upstream}</Typography.Text>
      ) : null}
      {route.format ? (
        <Typography.Text type="secondary">{t(locale, "details.format")}: {route.format}</Typography.Text>
      ) : null}
      {route.contractRef ? (
        <Typography.Text type="secondary">{t(locale, "details.contract")}: {route.contractRef}</Typography.Text>
      ) : null}
      {route.caveat ? (
        <Typography.Text type="secondary">{route.caveat}</Typography.Text>
      ) : null}
    </Flex>
  );
}

function Gallery({ items }: { items: ResolvedSystemGalleryItem[] }) {
  const locale = useGraphStore((state) => state.locale);
  const [activeIndex, setActiveIndex] = useState(0);

  if (items.length === 0) {
    return <EmptyValue>{t(locale, "details.noGalleryItem")}</EmptyValue>;
  }

  const activeItem = items[Math.min(activeIndex, items.length - 1)];
  const activeItemUrl = resolveGalleryUrl(activeItem.url);
  const activeItemThumbnailUrl = resolveGalleryUrl(activeItem.thumbnailUrl ?? activeItem.url);
  const hasMultipleItems = items.length > 1;
  const previousItem = () => {
    setActiveIndex((currentIndex) =>
      currentIndex === 0 ? items.length - 1 : currentIndex - 1,
    );
  };
  const nextItem = () => {
    setActiveIndex((currentIndex) => (currentIndex + 1) % items.length);
  };

  return (
    <div className="entity-gallery-slider">
      <figure className="entity-gallery-item" key={activeItem.id}>
        {activeItem.type === "image" ? (
          <a
            className="entity-gallery-image-link"
            href={activeItemUrl}
            target="_blank"
            rel="noreferrer"
          >
            <img
              src={activeItemThumbnailUrl}
              alt={activeItem.altText ?? activeItem.title ?? activeItem.caption ?? t(locale, "details.galleryImageAlt")}
              loading="lazy"
            />
          </a>
        ) : (
          <iframe
            src={activeItemUrl}
            title={activeItem.title ?? activeItem.id}
            loading="lazy"
          />
        )}
        <figcaption>
          {activeItem.title ? <Typography.Text>{activeItem.title}</Typography.Text> : null}
          {activeItem.caption ? (
            <Typography.Text type="secondary">{activeItem.caption}</Typography.Text>
          ) : null}
          <Typography.Text type="secondary">
            {t(locale, "common.source")}: <SourceLink source={activeItem.source} />
          </Typography.Text>
        </figcaption>
      </figure>
      {hasMultipleItems ? (
        <Flex className="entity-gallery-controls" align="center" justify="space-between">
          <Button
            aria-label={t(locale, "details.previousGalleryImage")}
            icon={<LeftOutlined />}
            size="small"
            type="text"
            onClick={previousItem}
          />
          <Typography.Text type="secondary">
            {Math.min(activeIndex, items.length - 1) + 1} / {items.length}
          </Typography.Text>
          <Button
            aria-label={t(locale, "details.nextGalleryImage")}
            icon={<RightOutlined />}
            size="small"
            type="text"
            onClick={nextItem}
          />
        </Flex>
      ) : null}
    </div>
  );
}

function SystemIntro({
  operatorNodes,
  system,
}: {
  operatorNodes: GraphNode[];
  system: GraphNode;
}) {
  const locale = useGraphStore((state) => state.locale);
  const localization = resolveNodeDisplay(system, locale);
  const operatorNames = operatorNodes.map((operator) => nodeTitle(operator, locale));

  return (
    <section className="entity-system-intro">
      <Flex className="entity-system-heading" vertical gap={4}>
        <Typography.Title className="entity-system-name" level={3}>
          {localization.title}
        </Typography.Title>
        <Typography.Text className="entity-system-operator">
          {operatorNames.length > 0
            ? t(locale, "details.operatedBy", { operator: operatorNames.join(", ") })
            : t(locale, "details.operatorNotRecorded")}
        </Typography.Text>
        {localization.isLocaleFallback ? (
          <Tag bordered={false}>
            {localization.displayLocale
              ? t(locale, "common.showingLocale", {
                  locale: localeName(localization.displayLocale, locale),
                })
              : t(locale, "common.noLocalization")}
          </Tag>
        ) : null}
        {system.url ? (
          <Typography.Link
            className="entity-system-url"
            href={system.url}
            target="_blank"
            rel="noreferrer"
          >
            {system.url}
          </Typography.Link>
        ) : (
          <Typography.Text className="entity-system-url" type="secondary">
            {t(locale, "details.mainUrlNotRecorded")}
          </Typography.Text>
        )}
      </Flex>
      {localization.summary ? (
        <Typography.Paragraph className="entity-detail-note entity-system-short-description">
          {localization.summary}
        </Typography.Paragraph>
      ) : null}
      <Gallery items={systemGallery(system, localization)} />
      {localization.description ? (
        <Typography.Paragraph className="entity-detail-note entity-system-long-description">
          {localization.description}
        </Typography.Paragraph>
      ) : null}
    </section>
  );
}

function relationshipLabel(
  relationship: GraphEdge,
  currentEntityId: string,
  locale: SupportedLocale,
) {
  const direction =
    relationship.sourceNodeId === currentEntityId ? "outgoing" : "incoming";
  return `${facetLabel(locale, "edgeKind", relationship.kind)} (${facetLabel(locale, "relationshipDirection", direction)})`;
}

function ReviewSection({ entity }: { entity: GraphNode }) {
  const updateNode = useGraphStore((state) => state.updateNode);
  const locale = useGraphStore((state) => state.locale);
  const localization = resolveNodeDisplay(entity, locale);
  const reviewLocale = localization.displayLocale;
  const currentReviewState = localization.reviewState ?? "agent_researched";
  const [reviewState, setReviewState] = useState<ReviewState>(currentReviewState);
  const [reviewerNote, setReviewerNote] = useState(localization.reviewerNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReviewState(currentReviewState);
    setReviewerNote(localization.reviewerNote ?? "");
    setError(null);
    setSaving(false);
  }, [currentReviewState, entity.id, localization.displayLocale, localization.reviewerNote]);

  const normalizedReviewerNote = reviewerNote.trim() || null;
  const hasChanges =
    reviewState !== currentReviewState ||
    normalizedReviewerNote !== (localization.reviewerNote ?? null);
  const reviewStateOptions = reviewStates.map((value) => ({
    label: facetLabel(locale, "reviewState", value),
    value,
  }));

  async function saveReview() {
    if (!hasChanges || !reviewLocale) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updatedNode = await updateNodeLocalizationReview(
        entity.id,
        reviewLocale,
        {
          reviewState,
          reviewerNote: normalizedReviewerNote,
        },
      );
      updateNode(updatedNode);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t(locale, "details.reviewUpdateFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DetailSection title={t(locale, "details.review")}>
      <div className="entity-detail-grid">
        <InlineField label={t(locale, "details.displayedLocale")}>
          {reviewLocale ? (
            <Tag bordered={false}>{localeName(reviewLocale, locale)}</Tag>
          ) : (
            <EmptyValue>{t(locale, "common.noLocalization")}</EmptyValue>
          )}
        </InlineField>
        <InlineField label={t(locale, "details.reviewState")}>
          {canReviewNodes ? (
            <Select
              className="entity-review-control"
              options={reviewStateOptions}
              size="small"
              value={reviewState}
              onChange={(value) => setReviewState(value)}
            />
          ) : (
            <Tag bordered={false} color={tagColor(currentReviewState)}>
              {facetLabel(locale, "reviewState", currentReviewState)}
            </Tag>
          )}
        </InlineField>
        {canReviewNodes ? (
          <InlineField label={t(locale, "details.reviewerNote")}>
            <Input.TextArea
              autoSize={{ minRows: 3, maxRows: 7 }}
              className="entity-review-note"
              value={reviewerNote}
              onChange={(event) => setReviewerNote(event.target.value)}
            />
          </InlineField>
        ) : null}
        {canReviewNodes ? (
          <InlineField label={t(locale, "details.reviewer")}>
            {localization.reviewer ?? <EmptyValue />}
          </InlineField>
        ) : null}
        {canReviewNodes ? (
          <InlineField label={t(locale, "details.lastReviewed")}>
            {formatDateTime(localization.lastReviewed, locale) ?? <EmptyValue />}
          </InlineField>
        ) : null}
      </div>
      {canReviewNodes ? (
        <Flex align="center" justify="space-between" gap={8}>
          {error ? (
            <Alert className="entity-review-error" message={error} showIcon type="error" />
          ) : <span />}
          <Button
            disabled={!hasChanges || !reviewLocale}
            loading={saving}
            size="small"
            type="primary"
            onClick={saveReview}
          >
            {t(locale, "details.saveReview")}
          </Button>
        </Flex>
      ) : null}
    </DetailSection>
  );
}

function RawSystemDump({
  entity,
  relationships,
  ryuRoutes,
}: {
  entity: GraphNode;
  relationships: GraphEdge[];
  ryuRoutes: RyuRoute[];
}) {
  const rawDump = {
    nodes: {
      id: entity.id,
      kind: entity.kind,
      country_code: entity.countryCode,
      subtype: entity.subtype,
      url: entity.url,
      record_depth: entity.recordDepth,
      properties: entity.properties,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
      localizations: entity.localizations,
      available_locales: entity.availableLocales,
      requested_locale: entity.requestedLocale,
      display_locale: entity.displayLocale,
      is_locale_fallback: entity.isLocaleFallback,
    },
    ryu_routes: ryuRoutes.map((route) => ({
      id: route.id,
      node_id: route.nodeId,
      status: route.status,
      mode: route.mode,
      priority: route.priority,
      capabilities: route.capabilities,
      target: route.target,
      upstream: route.upstream,
      format: route.format,
      contract_ref: route.contractRef,
      caveat: route.caveat,
      properties: route.properties,
      created_at: route.createdAt,
      updated_at: route.updatedAt,
    })),
    edges: relationships.map((relationship) => ({
      id: relationship.id,
      source_node_id: relationship.sourceNodeId,
      target_node_id: relationship.targetNodeId,
      kind: relationship.kind,
      note: relationship.note,
      properties: relationship.properties,
      created_at: relationship.createdAt,
      updated_at: relationship.updatedAt,
    })),
  };

  return (
    <pre className="entity-raw-dump">
      {JSON.stringify(rawDump, null, 2)}
    </pre>
  );
}

export function EntityDetailsPanel({
  extraActions,
  onClose,
  showCloseButton = true,
}: {
  extraActions?: ReactNode;
  onClose?: () => void;
  showCloseButton?: boolean;
}) {
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTabKey>("user");
  const graph = useGraphStore((state) => state.graph);
  const locale = useGraphStore((state) => state.locale);
  const selectedEntityId = useGraphStore((state) => state.selectedEntityId);
  const resetSelection = useGraphStore((state) => state.resetSelection);
  const entity = selectedEntityId && graph ? graph.nodeById[selectedEntityId] : null;

  if (!graph || !entity) {
    return null;
  }

  const relationshipIds = [
    ...(graph.outgoingByNodeId[entity.id] ?? []),
    ...(graph.incomingByNodeId[entity.id] ?? []),
  ];
  const relationships = relationshipIds.map(
    (relationshipId) => graph.edgeById[relationshipId],
  );
  const system = entity.kind === "system" ? entity : null;
  const localization = resolveNodeDisplay(entity, locale);
  const systemLocalization = system ? resolveNodeDisplay(system, locale) : null;
  const localizedMetrics = systemLocalization
    ? localizedMetricById(systemLocalization.details.usage)
    : {};
  const systemData = system?.properties.data ?? {
    recordCount: null,
    storageSize: null,
  };
  const resolvedDescriptors = system && systemLocalization
    ? systemDataDescriptors(system, systemLocalization)
    : [];
  const resolvedAccessPaths = system && systemLocalization
    ? systemAccessPaths(system, systemLocalization)
    : [];
  const readAccessPaths = resolvedAccessPaths.filter((path) => path.type === "read");
  const writeAccessPaths = resolvedAccessPaths.filter((path) => path.type !== "read");
  const ryuRoutes = system ? graph.ryuRoutesByNodeId[entity.id] ?? [] : [];
  const parentSystem = system ? parentSystemNodeForSystem(graph, system.id) : null;
  const operatorNodes = system ? operatorNodesForSystem(graph, system.id) : [];
  const operatorCountryCodes = [
    ...new Set(operatorNodes.map((node) => node.countryCode).filter(Boolean)),
  ];
  const isSystem = Boolean(system);
  const showRawFields = isSystem && canReviewNodes;
  const title = showRawFields ? (
    <Flex className="entity-details-header-title" align="center" gap={12}>
      <span className="entity-details-title-text">{localization.title}</span>
      <Tabs
        activeKey={activeDetailTab}
        className="entity-details-header-tabs"
        items={[
          {
            key: "user",
            label: t(locale, "details.userView"),
            children: null,
          },
          {
            key: "raw",
            label: t(locale, "details.rawFields"),
            children: null,
          },
        ]}
        onChange={(key) => setActiveDetailTab(key as DetailTabKey)}
      />
    </Flex>
  ) : (
    localization.title
  );
  const userView = (
    <Flex vertical gap={16}>
      {isSystem && system ? <SystemIntro operatorNodes={operatorNodes} system={system} /> : null}

      <DetailSection title={t(locale, "details.profile")}>
        <div className="entity-detail-grid">
          <InlineField label={t(locale, "details.entityType")}>
            <Tag bordered={false}>{facetLabel(locale, "nodeKind", entity.kind)}</Tag>
          </InlineField>
          <InlineField label={t(locale, "details.recordDepth")}>
            <Tag bordered={false} color={tagColor(entity.recordDepth)}>
              {facetLabel(locale, "recordDepth", entity.recordDepth)}
            </Tag>
          </InlineField>
          {isSystem && system ? (
            <>
              <InlineField label={t(locale, "details.role")}>
                {system.properties.role
                  ? facetLabel(locale, "systemRole", system.properties.role)
                  : <EmptyValue />}
              </InlineField>
              <InlineField label={t(locale, "details.operatorCountry")}>
                {operatorCountryCodes.length > 0 ? operatorCountryCodes.join(", ") : <EmptyValue />}
              </InlineField>
              <InlineField label={t(locale, "details.discipline")}>
                {system.properties.disciplineFamily ? (
                  facetLabel(locale, "disciplineFamily", system.properties.disciplineFamily)
                ) : (
                  <EmptyValue />
                )}
              </InlineField>
              <InlineField label={t(locale, "details.geographicScope")}>
                {system.properties.geographicScope ? (
                  facetLabel(locale, "geographicScope", system.properties.geographicScope)
                ) : (
                  <EmptyValue />
                )}
              </InlineField>
              <InlineField label={t(locale, "details.partOf")}>
                {parentSystem ? nodeTitle(parentSystem, locale) : <EmptyValue />}
              </InlineField>
              <InlineField label={t(locale, "details.aliases")}>
                {systemLocalization?.details.aliases.length
                  ? systemLocalization.details.aliases.join(", ")
                  : <EmptyValue />}
              </InlineField>
            </>
          ) : (
            <>
              <InlineField label={t(locale, "details.country")}>
                {entity.countryCode ?? <EmptyValue />}
              </InlineField>
              {entity.kind === "organization" ? (
                <InlineField label={t(locale, "details.subtype")}>
                  {entity.subtype ? facetLabel(locale, "subtype", entity.subtype) : <EmptyValue />}
                </InlineField>
              ) : null}
            </>
          )}
        </div>
      </DetailSection>

      <ReviewSection entity={entity} />

      {isSystem && system ? (
        <>
          <DetailSection title={t(locale, "details.data")}>
            <div className="entity-detail-grid">
              <InlineField label={t(locale, "details.dataTypes")}>
                <DescriptorTags descriptors={descriptorList(resolvedDescriptors, "type")} />
              </InlineField>
              <InlineField label={t(locale, "details.formats")}>
                <DescriptorTags descriptors={descriptorList(resolvedDescriptors, "format")} />
              </InlineField>
              <InlineField label={t(locale, "details.standards")}>
                <DescriptorTags descriptors={descriptorList(resolvedDescriptors, "standard")} />
              </InlineField>
              <InlineField label={t(locale, "details.records")}>
                <MetricValue
                  metric={resolveMetric(
                    systemData.recordCount,
                    systemLocalization?.details.data.recordCount,
                  )}
                />
              </InlineField>
              <InlineField label={t(locale, "details.databaseSize")}>
                <MetricValue
                  metric={resolveMetric(
                    systemData.storageSize,
                    systemLocalization?.details.data.storageSize,
                  )}
                />
              </InlineField>
            </div>
          </DetailSection>

          <DetailSection title={t(locale, "details.readAccess")}>
            <List<ResolvedSystemAccessPath>
              className="entity-detail-list"
              dataSource={readAccessPaths}
              locale={{ emptyText: t(locale, "details.noReadAccess") }}
              renderItem={(path) => (
                <List.Item><AccessDescription path={path} /></List.Item>
              )}
              size="small"
            />
          </DetailSection>

          <DetailSection title={t(locale, "details.writeAccess")}>
            <List<ResolvedSystemAccessPath>
              className="entity-detail-list"
              dataSource={writeAccessPaths}
              locale={{ emptyText: t(locale, "details.noWriteAccess") }}
              renderItem={(path) => (
                <List.Item><AccessDescription path={path} /></List.Item>
              )}
              size="small"
            />
          </DetailSection>

          {ryuRoutes.length > 0 ? (
            <DetailSection title={t(locale, "details.ryu")}>
              <List<RyuRoute>
                className="entity-detail-list"
                dataSource={ryuRoutes}
                renderItem={(route) => (
                  <List.Item><RyuRouteDescription route={route} /></List.Item>
                )}
                size="small"
              />
            </DetailSection>
          ) : null}

          <DetailSection title={t(locale, "details.usage")}>
            <List<ResolvedSourcedMetric>
              className="entity-detail-list"
              dataSource={(system.properties.usage ?? []).map((metric) =>
                resolveMetric(metric, localizedMetrics[metric.id]),
              ).filter((metric): metric is ResolvedSourcedMetric => Boolean(metric))}
              locale={{ emptyText: t(locale, "details.noUsageMetric") }}
              renderItem={(metric) => (
                <List.Item>
                  <Flex vertical gap={2}>
                    <Typography.Text>
                      {metric.label ?? facetLabel(locale, "metricKey", metric.key)}
                    </Typography.Text>
                    <MetricValue metric={metric} />
                  </Flex>
                </List.Item>
              )}
              size="small"
            />
          </DetailSection>
        </>
      ) : null}

      <DetailSection title={t(locale, "details.connections")}>
        <List<GraphEdge>
          className="entity-detail-list"
          dataSource={relationships}
          locale={{ emptyText: t(locale, "details.noRelationship") }}
          renderItem={(relationship) => {
            const otherEntityId =
              relationship.sourceNodeId === entity.id
                ? relationship.targetNodeId
                : relationship.sourceNodeId;
            const otherEntity = graph.nodeById[otherEntityId];
            return (
              <List.Item>
                <Flex vertical gap={2}>
                  <Typography.Text>
                    {otherEntity ? nodeTitle(otherEntity, locale) : otherEntityId}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {relationshipLabel(relationship, entity.id, locale)}
                  </Typography.Text>
                </Flex>
              </List.Item>
            );
          }}
          size="small"
        />
      </DetailSection>
    </Flex>
  );

  return (
    <Card
      className="entity-details-panel"
      size="small"
      title={title}
      extra={
        extraActions ??
        (showCloseButton ? (
          <Button
            aria-label={t(locale, "details.closeEntityDetails")}
            icon={<CloseOutlined />}
            size="small"
            type="text"
            onClick={onClose ?? resetSelection}
          />
        ) : null)
      }
    >
      {showRawFields && system && activeDetailTab === "raw" ? (
        <RawSystemDump
          entity={entity}
          relationships={relationships}
          ryuRoutes={ryuRoutes}
        />
      ) : (
        userView
      )}
    </Card>
  );
}
