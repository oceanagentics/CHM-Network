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
  SourcedMetric,
  SystemAccessPath,
  SystemDataDescriptor,
  SystemGalleryItem,
  SystemIdentifierScheme,
} from "../../../../shared/domain";
import { updateNodeReview } from "../api";
import { appPath, canReviewNodes } from "../config";
import { useGraphStore } from "../state/graphStore";

type DetailTabKey = "user" | "raw";

function labelize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

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
const reviewStateOptions = reviewStates.map((value) => ({ label: labelize(value), value }));

function formatDateTime(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

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

function EmptyValue({ children = "Not recorded" }: { children?: ReactNode }) {
  return <Typography.Text type="secondary">{children}</Typography.Text>;
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
  const fullSource = useGraphStore((state) => state.graph?.sourceById[source.id]);
  const sourceUrl = fullSource?.url ?? source.url;
  const tooltip = fullSource ? (
    <Flex className="source-record-tooltip" vertical gap={2}>
      <Typography.Text strong>{fullSource.title}</Typography.Text>
      <Typography.Text>ID: {fullSource.id}</Typography.Text>
      <Typography.Text>Type: {labelize(fullSource.sourceType)}</Typography.Text>
      {fullSource.publisher ? (
        <Typography.Text>Publisher: {fullSource.publisher}</Typography.Text>
      ) : null}
      {fullSource.publishedAt ? (
        <Typography.Text>Published: {fullSource.publishedAt}</Typography.Text>
      ) : null}
      {fullSource.accessedAt ? (
        <Typography.Text>Accessed: {fullSource.accessedAt}</Typography.Text>
      ) : null}
      {fullSource.url ? <Typography.Text>URL: {fullSource.url}</Typography.Text> : null}
      {fullSource.localPath ? (
        <Typography.Text>Local path: {fullSource.localPath}</Typography.Text>
      ) : null}
      {fullSource.note ? <Typography.Text>{fullSource.note}</Typography.Text> : null}
    </Flex>
  ) : (
    `Source record ${source.id} is not loaded.`
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
  descriptors: SystemDataDescriptor[],
  category: SystemDataDescriptor["category"],
) {
  return descriptors.filter((descriptor) => descriptor.category === category);
}

function DescriptorTags({ descriptors }: { descriptors: SystemDataDescriptor[] }) {
  if (descriptors.length === 0) {
    return <EmptyValue />;
  }

  return (
    <Flex gap={4} wrap>
      {descriptors.map((descriptor) => (
        <Tag key={descriptor.id} bordered={false}>
          {labelize(descriptor.label)}
        </Tag>
      ))}
    </Flex>
  );
}

function formatBytes(value: number) {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toLocaleString(undefined, { maximumFractionDigits: unitIndex === 0 ? 0 : 1 })} ${units[unitIndex]}`;
}

function formatMetricValue(metric: SourcedMetric) {
  if (metric.key === "storage_size_bytes" || metric.unit === "bytes") {
    return formatBytes(metric.value);
  }

  return `${metric.value.toLocaleString()} ${metric.unit}`;
}

function MetricValue({ metric }: { metric: SourcedMetric | null }) {
  if (!metric) {
    return <EmptyValue />;
  }

  return (
    <Flex vertical gap={2}>
      <Typography.Text>{formatMetricValue(metric)}</Typography.Text>
      {metric.description ? (
        <Typography.Text type="secondary">{metric.description}</Typography.Text>
      ) : null}
      <Typography.Text type="secondary">
        Source: <SourceLink source={metric.source} />
        {metric.observedAt ? ` · observed ${metric.observedAt}` : ""}
      </Typography.Text>
    </Flex>
  );
}

function AccessDescription({ path }: { path: SystemAccessPath }) {
  return (
    <Flex vertical gap={4}>
      <Flex align="center" gap={6} wrap>
        <Typography.Text>{labelize(path.label)}</Typography.Text>
        <Tag bordered={false}>{labelize(path.type)}</Tag>
        <Tag bordered={false}>{labelize(path.method)}</Tag>
      </Flex>
      <Typography.Text type="secondary">{path.description}</Typography.Text>
      <Typography.Link href={path.url} target="_blank" rel="noreferrer">
        {path.url}
      </Typography.Link>
      <Typography.Text type="secondary">
        Source: <SourceLink source={path.source} />
      </Typography.Text>
    </Flex>
  );
}

function RyuRouteDescription({ route }: { route: RyuRoute }) {
  return (
    <Flex vertical gap={4}>
      <Flex align="center" gap={6} wrap>
        <Typography.Text>{route.id}</Typography.Text>
        <Tag bordered={false}>{labelize(route.status)}</Tag>
        <Tag bordered={false}>{labelize(route.mode)}</Tag>
        <Tag bordered={false}>Priority {route.priority}</Tag>
        {route.capabilities.map((capability) => (
          <Tag key={capability} bordered={false}>{labelize(capability)}</Tag>
        ))}
      </Flex>
      {route.target ? (
        <Typography.Text type="secondary">Target: {route.target}</Typography.Text>
      ) : null}
      {route.upstream ? (
        <Typography.Text type="secondary">Upstream: {route.upstream}</Typography.Text>
      ) : null}
      {route.format ? (
        <Typography.Text type="secondary">Format: {route.format}</Typography.Text>
      ) : null}
      {route.contractRef ? (
        <Typography.Text type="secondary">Contract: {route.contractRef}</Typography.Text>
      ) : null}
      {route.caveat ? (
        <Typography.Text type="secondary">{route.caveat}</Typography.Text>
      ) : null}
    </Flex>
  );
}

function Gallery({ items }: { items: SystemGalleryItem[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (items.length === 0) {
    return <EmptyValue>No gallery item recorded</EmptyValue>;
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
              alt={activeItem.title ?? activeItem.caption ?? "Database sample"}
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
            Source: <SourceLink source={activeItem.source} />
          </Typography.Text>
        </figcaption>
      </figure>
      {hasMultipleItems ? (
        <Flex className="entity-gallery-controls" align="center" justify="space-between">
          <Button
            aria-label="Previous gallery image"
            icon={<LeftOutlined />}
            size="small"
            type="text"
            onClick={previousItem}
          />
          <Typography.Text type="secondary">
            {Math.min(activeIndex, items.length - 1) + 1} / {items.length}
          </Typography.Text>
          <Button
            aria-label="Next gallery image"
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

function SystemIntro({ system }: { system: GraphNode }) {
  return (
    <section className="entity-system-intro">
      <Flex className="entity-system-heading" vertical gap={4}>
        <Typography.Title className="entity-system-name" level={3}>
          {system.name}
        </Typography.Title>
        <Typography.Text className="entity-system-operator">
          {system.details.operator?.name ?? "Operator not recorded"}
        </Typography.Text>
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
            Main URL not recorded
          </Typography.Text>
        )}
      </Flex>
      {system.summary ? (
        <Typography.Paragraph className="entity-detail-note entity-system-short-description">
          {system.summary}
        </Typography.Paragraph>
      ) : null}
      <Gallery items={system.details.gallery} />
      {system.description ? (
        <Typography.Paragraph className="entity-detail-note entity-system-long-description">
          {system.description}
        </Typography.Paragraph>
      ) : null}
    </section>
  );
}

function IdentifierDescription({ scheme }: { scheme: SystemIdentifierScheme }) {
  return (
    <Flex vertical gap={2}>
      <Typography.Text>{labelize(scheme.scheme)}</Typography.Text>
      {scheme.appliesTo ? (
        <Typography.Text type="secondary">
          Applies to {scheme.appliesTo}
        </Typography.Text>
      ) : null}
      {scheme.description ? (
        <Typography.Text type="secondary">{scheme.description}</Typography.Text>
      ) : null}
      {scheme.source ? (
        <Typography.Text type="secondary">
          Source: <SourceLink source={scheme.source} />
        </Typography.Text>
      ) : null}
    </Flex>
  );
}

function relationshipLabel(relationship: GraphEdge, currentEntityId: string) {
  const direction =
    relationship.sourceNodeId === currentEntityId ? "outgoing" : "incoming";
  return `${labelize(relationship.kind)} (${direction})`;
}

function ReviewSection({ entity }: { entity: GraphNode }) {
  const updateNode = useGraphStore((state) => state.updateNode);
  const [reviewState, setReviewState] = useState<ReviewState>(entity.reviewState);
  const [reviewerNote, setReviewerNote] = useState(entity.reviewerNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReviewState(entity.reviewState);
    setReviewerNote(entity.reviewerNote ?? "");
    setError(null);
    setSaving(false);
  }, [entity.id, entity.reviewState, entity.reviewerNote]);

  const normalizedReviewerNote = reviewerNote.trim() || null;
  const hasChanges =
    reviewState !== entity.reviewState ||
    normalizedReviewerNote !== (entity.reviewerNote ?? null);

  async function saveReview() {
    if (!hasChanges) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updatedNode = await updateNodeReview(entity.id, {
        reviewState,
        reviewerNote: normalizedReviewerNote,
      });
      updateNode(updatedNode);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Review update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DetailSection title="Review">
      <div className="entity-detail-grid">
        <InlineField label="Review state">
          {canReviewNodes ? (
            <Select
              className="entity-review-control"
              options={reviewStateOptions}
              size="small"
              value={reviewState}
              onChange={(value) => setReviewState(value)}
            />
          ) : (
            <Tag bordered={false} color={tagColor(entity.reviewState)}>
              {labelize(entity.reviewState)}
            </Tag>
          )}
        </InlineField>
        {canReviewNodes ? (
          <InlineField label="Reviewer note">
            <Input.TextArea
              autoSize={{ minRows: 3, maxRows: 7 }}
              className="entity-review-note"
              value={reviewerNote}
              onChange={(event) => setReviewerNote(event.target.value)}
            />
          </InlineField>
        ) : null}
        {canReviewNodes ? (
          <InlineField label="Reviewer">
            {entity.reviewer ?? <EmptyValue />}
          </InlineField>
        ) : null}
        {canReviewNodes ? (
          <InlineField label="Last reviewed">
            {formatDateTime(entity.lastReviewed) ?? <EmptyValue />}
          </InlineField>
        ) : null}
      </div>
      {canReviewNodes ? (
        <Flex align="center" justify="space-between" gap={8}>
          {error ? (
            <Alert className="entity-review-error" message={error} showIcon type="error" />
          ) : <span />}
          <Button
            disabled={!hasChanges}
            loading={saving}
            size="small"
            type="primary"
            onClick={saveReview}
          >
            Save review
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
      name: entity.name,
      country_code: entity.countryCode,
      subtype: entity.subtype,
      url: entity.url,
      summary: entity.summary,
      description: entity.description,
      record_depth: entity.recordDepth,
      review_state: entity.reviewState,
      reviewer_note: entity.reviewerNote,
      reviewer: entity.reviewer,
      last_reviewed: entity.lastReviewed,
      review: entity.review,
      details: entity.details,
      properties: entity.properties,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
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
  const ryuRoutes = system ? graph.ryuRoutesByNodeId[entity.id] ?? [] : [];
  const parentSystemId =
    relationships.find(
      (relationship) =>
        relationship.kind === "part_of" && relationship.sourceNodeId === entity.id,
    )?.targetNodeId ?? null;
  const isSystem = Boolean(system);
  const showRawFields = isSystem && canReviewNodes;
  const title = showRawFields ? (
    <Flex className="entity-details-header-title" align="center" gap={12}>
      <span className="entity-details-title-text">{entity.name}</span>
      <Tabs
        activeKey={activeDetailTab}
        className="entity-details-header-tabs"
        items={[
          {
            key: "user",
            label: "User view",
            children: null,
          },
          {
            key: "raw",
            label: "Raw fields",
            children: null,
          },
        ]}
        onChange={(key) => setActiveDetailTab(key as DetailTabKey)}
      />
    </Flex>
  ) : (
    entity.name
  );
  const userView = (
    <Flex vertical gap={16}>
      {isSystem && system ? <SystemIntro system={system} /> : null}

      <DetailSection title="Profile">
        <div className="entity-detail-grid">
          <InlineField label="Entity type">
            <Tag bordered={false}>{labelize(entity.kind)}</Tag>
          </InlineField>
          <InlineField label="Record depth">
            <Tag bordered={false} color={tagColor(entity.recordDepth)}>
              {labelize(entity.recordDepth)}
            </Tag>
          </InlineField>
          {isSystem && system ? (
            <>
              <InlineField label="Role">
                {system.details.role ? labelize(system.details.role) : <EmptyValue />}
              </InlineField>
              <InlineField label="Operator country">
                {system.details.operator?.countryCode ?? system.countryCode ?? <EmptyValue />}
              </InlineField>
              <InlineField label="Discipline">
                {system.details.disciplineFamily ? (
                  labelize(system.details.disciplineFamily)
                ) : (
                  <EmptyValue />
                )}
              </InlineField>
              <InlineField label="Geographic scope">
                {system.details.geographicScope ? (
                  labelize(system.details.geographicScope)
                ) : (
                  <EmptyValue />
                )}
              </InlineField>
              <InlineField label="Part of">
                {parentSystemId
                  ? graph.nodeById[parentSystemId]?.name ?? parentSystemId
                  : <EmptyValue />}
              </InlineField>
              <InlineField label="Aliases">
                {system.details.aliases.length > 0 ? system.details.aliases.join(", ") : <EmptyValue />}
              </InlineField>
            </>
          ) : (
            <>
              <InlineField label="Country">
                {entity.countryCode ?? <EmptyValue />}
              </InlineField>
              {entity.kind === "organization" ? (
                <InlineField label="Subtype">
                  {entity.subtype ?? <EmptyValue />}
                </InlineField>
              ) : null}
            </>
          )}
        </div>
      </DetailSection>

      <ReviewSection entity={entity} />

      {isSystem && system ? (
        <>
          <DetailSection title="Data">
            <div className="entity-detail-grid">
              <InlineField label="Data types">
                <DescriptorTags descriptors={descriptorList(system.details.data.descriptors, "type")} />
              </InlineField>
              <InlineField label="Formats">
                <DescriptorTags descriptors={descriptorList(system.details.data.descriptors, "format")} />
              </InlineField>
              <InlineField label="Standards">
                <DescriptorTags descriptors={descriptorList(system.details.data.descriptors, "standard")} />
              </InlineField>
              <InlineField label="Records">
                <MetricValue metric={system.details.data.recordCount} />
              </InlineField>
              <InlineField label="Database size">
                <MetricValue metric={system.details.data.storageSize} />
              </InlineField>
            </div>
          </DetailSection>

          <DetailSection title="Access">
            <List<SystemAccessPath>
              className="entity-detail-list"
              dataSource={system.details.access}
              locale={{ emptyText: "No access path recorded" }}
              renderItem={(path) => (
                <List.Item><AccessDescription path={path} /></List.Item>
              )}
              size="small"
            />
          </DetailSection>

          {ryuRoutes.length > 0 ? (
            <DetailSection title="Ryu">
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

          <DetailSection title="Identifiers">
            <List<SystemIdentifierScheme>
              className="entity-detail-list"
              dataSource={system.details.identifiers}
              locale={{ emptyText: "No identifier scheme recorded" }}
              renderItem={(scheme) => (
                <List.Item><IdentifierDescription scheme={scheme} /></List.Item>
              )}
              size="small"
            />
          </DetailSection>

          <DetailSection title="Usage">
            <List<SourcedMetric>
              className="entity-detail-list"
              dataSource={system.details.usage}
              locale={{ emptyText: "No usage metric recorded" }}
              renderItem={(metric) => (
                <List.Item>
                  <Flex vertical gap={2}>
                    <Typography.Text>{labelize(metric.key)}</Typography.Text>
                    <MetricValue metric={metric} />
                  </Flex>
                </List.Item>
              )}
              size="small"
            />
          </DetailSection>
        </>
      ) : null}

      <DetailSection title="Connections">
        <List<GraphEdge>
          className="entity-detail-list"
          dataSource={relationships}
          locale={{ emptyText: "No relationship recorded" }}
          renderItem={(relationship) => {
            const otherEntityId =
              relationship.sourceNodeId === entity.id
                ? relationship.targetNodeId
                : relationship.sourceNodeId;
            const otherEntity = graph.nodeById[otherEntityId];
            return (
              <List.Item>
                <Flex vertical gap={2}>
                  <Typography.Text>{otherEntity?.name ?? otherEntityId}</Typography.Text>
                  <Typography.Text type="secondary">
                    {relationshipLabel(relationship, entity.id)}
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
            aria-label="Close entity details"
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
