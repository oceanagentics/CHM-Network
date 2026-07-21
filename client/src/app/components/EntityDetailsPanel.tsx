import type { ReactNode } from "react";
import { CloseOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { Button, Card, Collapse, Flex, List, Tag, Tooltip, Typography } from "antd";

import type {
  Entity,
  EntitySource,
  Relationship,
  Source,
  SystemAccessPath,
  SystemDataClaim,
  SystemIdentifierScheme,
  SystemSubmissionPath,
} from "../../../../shared/domain";
import { useGraphStore } from "../state/graphStore";

function labelize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function confidence(value: number): string {
  return value.toFixed(2);
}

interface FieldHelp {
  description: string;
  options: string[];
}

interface DownloadLink {
  id: string;
  label: string;
  url: string;
  note?: string | null;
}

interface DetailItem {
  id: string;
  label: string;
  value: string;
}

interface ItemOverview {
  text: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
}

const fieldHelp: Record<string, FieldHelp> = {
  "entity type": {
    description: "The kind of graph item this record represents.",
    options: [
      "Country: a national jurisdiction represented on the map.",
      "Organization: an agency, institution, or network operator.",
      "System: a data platform, catalog, portal, or technical service.",
    ],
  },
  status: {
    description: "The current operating state recorded for this item.",
    options: [
      "Active: currently in use.",
      "Planned: expected or announced but not yet operating.",
      "Speculative: plausible but still uncertain.",
      "Deprecated: retired, replaced, or no longer maintained.",
    ],
  },
  confidence: {
    description: "How strongly the available evidence supports this record.",
    options: [
      "1.00 is highest confidence.",
      "Lower values mean the record needs stronger confirmation.",
      "Source-specific confidence can also appear in evidence links.",
    ],
  },
  country: {
    description: "The country code attached to this entity when the data can locate it.",
    options: [
      "Usually an ISO country code.",
      "May be blank for international, regional, or unresolved records.",
    ],
  },
  evidence: {
    description: "Sources linked to this entity, used to support the claims shown here.",
    options: [
      "May include publisher, source type, and source URL.",
      "Evidence can support identity, status, access, and relationship claims.",
    ],
  },
  connections: {
    description: "Relationships connecting this item to neighboring countries, organizations, or systems.",
    options: [
      "Governs: country to organization.",
      "Operates, publishes to, and syncs to: organization/system workflows.",
      "Part of: system hierarchy.",
    ],
  },
  subtype: {
    description: "A more specific classification for an organization or system.",
    options: [
      "Examples include agency, program, platform, catalog, repository, or portal.",
      "Values are recorded from the available research data.",
    ],
  },
};

const downloadKeyPattern = /download|downloadurl|downloadpage|dataurl|accessurl|data_link|data link/i;
const dataTypeKeyPattern = /data.?type|data.?format|file.?type|file.?format|format|formats|mime/i;
const resolutionKeyPattern = /resolution|spatial|scale|pixel|temporal|time/i;

function helpFor(label: string) {
  return fieldHelp[label.toLowerCase()];
}

function HelpLabel({ label }: { label: string }) {
  const help = helpFor(label);

  if (!help) {
    return <>{label}</>;
  }

  return (
    <span className="entity-detail-label-with-help">
      <span>{label}</span>
      <Tooltip
        placement="left"
        title={
          <div className="entity-detail-help">
            <Typography.Text strong>{label}</Typography.Text>
            <Typography.Paragraph>{help.description}</Typography.Paragraph>
            <ul>
              {help.options.map((option) => (
                <li key={option}>{option}</li>
              ))}
            </ul>
          </div>
        }
      >
        <InfoCircleOutlined
          aria-label={`About ${label}`}
          className="entity-detail-help-icon"
        />
      </Tooltip>
    </span>
  );
}

function valueToStrings(value: unknown): string[] {
  if (value === null || value === undefined || value === "") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(valueToStrings);
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .flatMap(([key, nestedValue]) =>
        valueToStrings(nestedValue).map((nestedString) => `${labelize(key)}: ${nestedString}`),
      );
  }

  return [String(value)];
}

function propertyValues(
  properties: Record<string, unknown>,
  pattern: RegExp,
): DetailItem[] {
  return Object.entries(properties).flatMap(([key, value]) =>
    pattern.test(key)
      ? valueToStrings(value).map((propertyValue, index) => ({
          id: `${key}-${index}`,
          label: labelize(key),
          value: propertyValue,
        }))
      : [],
  );
}

function downloadLinksFromProperties(
  properties: Record<string, unknown>,
): DownloadLink[] {
  return propertyValues(properties, downloadKeyPattern)
    .filter((item) => /^https?:\/\//i.test(item.value))
    .map((item) => ({
      id: `property-${item.id}`,
      label: item.label,
      url: item.value,
    }));
}

function downloadLinksFromAccessPaths(paths: SystemAccessPath[]): DownloadLink[] {
  return paths
    .filter((path) => {
      const searchable = `${path.method} ${path.label} ${path.note ?? ""}`;
      return Boolean(path.url) && /download|data|access|api|portal|catalog/i.test(searchable);
    })
    .map((path) => ({
      id: path.id,
      label: labelize(path.label),
      url: path.url ?? "",
      note: path.note,
    }));
}

function resolutionItemsForEntity(entity: Entity, claims: SystemDataClaim[]): DetailItem[] {
  const propertyItems = propertyValues(entity.properties, resolutionKeyPattern);
  const claimItems = claims
    .filter((claim) => claim.note && resolutionKeyPattern.test(claim.note))
    .map((claim) => ({
      id: `claim-${claim.id}`,
      label: labelize(claim.label),
      value: claim.note ?? "",
    }));

  return [...propertyItems, ...claimItems];
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
      <Typography.Text className="entity-detail-label">
        <HelpLabel label={label} />
      </Typography.Text>
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
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Collapse
      className="entity-detail-collapse"
      defaultActiveKey={defaultOpen ? [title] : []}
      expandIconPosition="end"
      items={[
        {
          key: title,
          label: (
            <Typography.Text strong>
              <HelpLabel label={title} />
            </Typography.Text>
          ),
          children,
        },
      ]}
      size="small"
    />
  );
}

function claimList(claims: SystemDataClaim[], category: SystemDataClaim["category"]) {
  return claims.filter((claim) => claim.category === category);
}

function ClaimTags({ claims }: { claims: SystemDataClaim[] }) {
  if (claims.length === 0) {
    return <EmptyValue />;
  }

  return (
    <Flex gap={4} wrap>
      {claims.map((claim) => (
        <Tag key={claim.id} bordered={false}>
          {labelize(claim.label)}
        </Tag>
      ))}
    </Flex>
  );
}

function DetailTags({ items }: { items: DetailItem[] }) {
  if (items.length === 0) {
    return <EmptyValue />;
  }

  return (
    <Flex gap={4} wrap>
      {items.map((item) => (
        <Tooltip key={item.id} title={item.label}>
          <Tag bordered={false}>{item.value}</Tag>
        </Tooltip>
      ))}
    </Flex>
  );
}

function DownloadLinks({ links }: { links: DownloadLink[] }) {
  if (links.length === 0) {
    return <EmptyValue />;
  }

  return (
    <Flex vertical gap={4}>
      {links.map((link) => (
        <Flex key={link.id} vertical gap={2}>
          <Typography.Link href={link.url} target="_blank" rel="noreferrer">
            {link.label}
          </Typography.Link>
          {link.note ? (
            <Typography.Text type="secondary">{link.note}</Typography.Text>
          ) : null}
        </Flex>
      ))}
    </Flex>
  );
}

function DetailList({ items }: { items: DetailItem[] }) {
  if (items.length === 0) {
    return <EmptyValue />;
  }

  return (
    <Flex vertical gap={4}>
      {items.map((item) => (
        <Typography.Text key={item.id}>
          <Typography.Text type="secondary">{item.label}: </Typography.Text>
          {item.value}
        </Typography.Text>
      ))}
    </Flex>
  );
}

function pathDescription(path: SystemAccessPath | SystemSubmissionPath) {
  return (
    <Flex vertical gap={2}>
      <Flex align="center" gap={6} wrap>
        <Typography.Text>{labelize(path.label)}</Typography.Text>
        <Tag bordered={false}>{labelize(path.method)}</Tag>
        <Typography.Text type="secondary">
          confidence {confidence(path.confidence)}
        </Typography.Text>
      </Flex>
      {path.url ? (
        <Typography.Link href={path.url} target="_blank" rel="noreferrer">
          {path.url}
        </Typography.Link>
      ) : null}
      {path.note ? (
        <Typography.Text type="secondary">{path.note}</Typography.Text>
      ) : null}
    </Flex>
  );
}

function relationshipLabel(relationship: Relationship, currentEntityId: string) {
  const direction =
    relationship.sourceEntityId === currentEntityId ? "outgoing" : "incoming";
  return `${labelize(relationship.type)} (${direction})`;
}

function firstSentences(text: string, maxSentences = 2): string {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g);

  return (sentences ?? [text]).slice(0, maxSentences).join(" ").trim();
}

function itemNoun(entity: Entity, profileRole: string | null | undefined): string {
  if (entity.kind === "country") {
    return "country";
  }
  if (entity.kind === "organization") {
    return entity.subtype ? labelize(entity.subtype).toLowerCase() : "organization";
  }
  return profileRole ? labelize(profileRole).toLowerCase() : "system";
}

function itemOverview({
  entity,
  primaryUrl,
  profileRole,
  sourceLinks,
  sourceById,
}: {
  entity: Entity;
  primaryUrl: string | null | undefined;
  profileRole: string | null | undefined;
  sourceLinks: EntitySource[];
  sourceById: Record<string, Source>;
}): ItemOverview {
  const candidates = sourceLinks.flatMap<ItemOverview>((sourceLink) => {
    const source = sourceById[sourceLink.sourceId];
    if (!source) {
      return [];
    }

    const sourceDescriptions: ItemOverview[] = [];
    if (sourceLink.excerpt) {
      sourceDescriptions.push({
        sourceTitle: source.title,
        sourceUrl: source.url,
        text: firstSentences(sourceLink.excerpt),
      });
    }
    if (source.note) {
      sourceDescriptions.push({
        sourceTitle: source.title,
        sourceUrl: source.url,
        text: firstSentences(source.note),
      });
    }
    return sourceDescriptions;
  });

  const bestCandidate = candidates.sort((left, right) => {
    const leftScore = left.text.length + (left.sourceUrl ? 40 : 0);
    const rightScore = right.text.length + (right.sourceUrl ? 40 : 0);
    return rightScore - leftScore;
  })[0];

  if (bestCandidate) {
    return bestCandidate;
  }

  if (entity.description) {
    return {
      sourceTitle: null,
      sourceUrl: primaryUrl ?? null,
      text: firstSentences(entity.description),
    };
  }

  const noun = itemNoun(entity, profileRole);
  return {
    sourceTitle: primaryUrl ? "Primary link" : null,
    sourceUrl: primaryUrl ?? null,
    text: `${entity.name} is recorded as a ${noun} in the CHM Network. Open the sections below for evidence, data access, identifiers, and connections that explain how it fits into the network.`,
  };
}

export function EntityDetailsPanel() {
  const graph = useGraphStore((state) => state.graph);
  const selectedEntityId = useGraphStore((state) => state.selectedEntityId);
  const resetSelection = useGraphStore((state) => state.resetSelection);
  const entity = selectedEntityId && graph ? graph.entityById[selectedEntityId] : null;

  if (!graph || !entity) {
    return null;
  }

  const relationshipIds = [
    ...(graph.outgoingByEntityId[entity.id] ?? []),
    ...(graph.incomingByEntityId[entity.id] ?? []),
  ];
  const relationships = relationshipIds.map(
    (relationshipId) => graph.relationshipById[relationshipId],
  );
  const sourceLinks = graph.entitySourcesByEntityId[entity.id] ?? [];
  const sources = sourceLinks
    .map((sourceLink) => graph.sourceById[sourceLink.sourceId])
    .filter((source): source is Source => Boolean(source));

  const profile = graph.systemProfileBySystemId[entity.id];
  const claims = graph.systemDataClaimsBySystemId[entity.id] ?? [];
  const accessPaths = graph.systemAccessPathsBySystemId[entity.id] ?? [];
  const submissionPaths = graph.systemSubmissionPathsBySystemId[entity.id] ?? [];
  const identifierSchemes =
    graph.systemIdentifierSchemesBySystemId[entity.id] ?? [];
  const operatorRelationship = relationships.find(
    (relationship) => relationship.type === "operates",
  );
  const operator = operatorRelationship
    ? graph.entityById[operatorRelationship.sourceEntityId]
    : null;
  const parentRelationship = relationships.find(
    (relationship) =>
      relationship.type === "part_of" && relationship.sourceEntityId === entity.id,
  );
  const parentSystem = parentRelationship
    ? graph.entityById[parentRelationship.targetEntityId]
    : null;
  const isSystem = entity.kind === "system";
  const propertyDownloadLinks = downloadLinksFromProperties(entity.properties);
  const downloadLinks = [
    ...downloadLinksFromAccessPaths(accessPaths),
    ...propertyDownloadLinks,
  ];
  const propertyDataTypes = propertyValues(entity.properties, dataTypeKeyPattern);
  const resolutionItems = resolutionItemsForEntity(entity, claims);
  const hasEntityDataAccess =
    !isSystem &&
    (downloadLinks.length > 0 ||
      propertyDataTypes.length > 0 ||
      resolutionItems.length > 0);
  const description = itemOverview({
    entity,
    primaryUrl: profile?.primaryUrl,
    profileRole: profile?.role,
    sourceById: graph.sourceById,
    sourceLinks,
  });

  return (
    <Card
      className={`entity-details-panel is-${entity.kind}`}
      size="small"
      title={entity.name}
      extra={
        <Button
          aria-label="Close entity details"
          icon={<CloseOutlined />}
          size="small"
          type="text"
          onClick={resetSelection}
        />
      }
    >
      <Flex vertical gap={16}>
        <div className="entity-detail-summary">
          <Typography.Text className="entity-detail-summary-eyebrow">
            Item overview
          </Typography.Text>
          <Typography.Paragraph className="entity-detail-summary-copy">
            {description.text}
          </Typography.Paragraph>
          {description.sourceTitle || description.sourceUrl ? (
            <Typography.Text className="entity-detail-summary-source">
              Source:{" "}
              {description.sourceUrl ? (
                <Typography.Link
                  href={description.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {description.sourceTitle ?? description.sourceUrl}
                </Typography.Link>
              ) : (
                description.sourceTitle
              )}
            </Typography.Text>
          ) : null}
        </div>

        <DetailSection title="Profile">
          <div className="entity-detail-grid">
            <InlineField label="Entity type">
              <Tag bordered={false}>{labelize(entity.kind)}</Tag>
            </InlineField>
            <InlineField label="Status">
              <Tag color={entity.status === "active" ? "green" : "default"}>
                {entity.status}
              </Tag>
            </InlineField>
            <InlineField label="Confidence">
              {confidence(entity.confidence)}
            </InlineField>
            {isSystem ? (
              <>
                <InlineField label="Role">
                  {profile?.role ? labelize(profile.role) : <EmptyValue />}
                </InlineField>
                <InlineField label="Operator">
                  {operator?.name ?? <EmptyValue />}
                </InlineField>
                <InlineField label="Operator country">
                  {operator?.countryCode ?? entity.countryCode ?? <EmptyValue />}
                </InlineField>
                <InlineField label="Discipline">
                  {profile?.disciplineFamily ? (
                    labelize(profile.disciplineFamily)
                  ) : (
                    <EmptyValue />
                  )}
                </InlineField>
                <InlineField label="Geographic scope">
                  {profile?.geographicScope ? (
                    labelize(profile.geographicScope)
                  ) : (
                    <EmptyValue />
                  )}
                </InlineField>
                <InlineField label="Part of">
                  {parentSystem?.name ?? <EmptyValue />}
                </InlineField>
                <InlineField label="Aliases">
                  {profile?.aliases ?? <EmptyValue />}
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
          {profile?.primaryUrl ? (
            <Typography.Link href={profile.primaryUrl} target="_blank" rel="noreferrer">
              {profile.primaryUrl}
            </Typography.Link>
          ) : null}
        </DetailSection>

        {isSystem ? (
          <>
            <DetailSection title="Data">
              <div className="entity-detail-grid">
                <InlineField label="Data types">
                  <ClaimTags claims={claimList(claims, "data_type")} />
                </InlineField>
                <InlineField label="Data formats">
                  <ClaimTags claims={claimList(claims, "data_format")} />
                </InlineField>
                {propertyDataTypes.length > 0 ? (
                  <InlineField label="Recorded data fields">
                    <DetailTags items={propertyDataTypes} />
                  </InlineField>
                ) : null}
                <InlineField label="Download links">
                  <DownloadLinks links={downloadLinks} />
                </InlineField>
                <InlineField label="Data resolutions">
                  <DetailList items={resolutionItems} />
                </InlineField>
                <InlineField label="Standards">
                  <ClaimTags claims={claimList(claims, "standard")} />
                </InlineField>
              </div>
              {profile?.dataSummary ? (
                <Typography.Paragraph className="entity-detail-note">
                  {profile.dataSummary}
                </Typography.Paragraph>
              ) : null}
            </DetailSection>

            <DetailSection title="Access">
              {profile?.accessSummary ? (
                <Typography.Paragraph className="entity-detail-note">
                  {profile.accessSummary}
                </Typography.Paragraph>
              ) : null}
              <List
                className="entity-detail-list"
                dataSource={accessPaths}
                locale={{ emptyText: "No access path recorded" }}
                renderItem={(path) => (
                  <List.Item>{pathDescription(path)}</List.Item>
                )}
                size="small"
              />
            </DetailSection>

            <DetailSection title="Submission">
              {profile?.submissionSummary ? (
                <Typography.Paragraph className="entity-detail-note">
                  {profile.submissionSummary}
                </Typography.Paragraph>
              ) : null}
              <List
                className="entity-detail-list"
                dataSource={submissionPaths}
                locale={{ emptyText: "No submission path recorded" }}
                renderItem={(path) => (
                  <List.Item>{pathDescription(path)}</List.Item>
                )}
                size="small"
              />
            </DetailSection>

            <DetailSection title="Identifiers">
              <List<SystemIdentifierScheme>
                className="entity-detail-list"
                dataSource={identifierSchemes}
                locale={{ emptyText: "No identifier scheme recorded" }}
                renderItem={(scheme) => (
                  <List.Item>
                    <Flex vertical gap={2}>
                      <Typography.Text>{labelize(scheme.scheme)}</Typography.Text>
                      {scheme.appliesTo ? (
                        <Typography.Text type="secondary">
                          Applies to {scheme.appliesTo}
                        </Typography.Text>
                      ) : null}
                      {scheme.note ? (
                        <Typography.Text type="secondary">{scheme.note}</Typography.Text>
                      ) : null}
                    </Flex>
                  </List.Item>
                )}
                size="small"
              />
            </DetailSection>
          </>
        ) : null}

        {hasEntityDataAccess ? (
          <DetailSection title="Data access">
            <div className="entity-detail-grid">
              {downloadLinks.length > 0 ? (
                <InlineField label="Download links">
                  <DownloadLinks links={downloadLinks} />
                </InlineField>
              ) : null}
              {propertyDataTypes.length > 0 ? (
                <InlineField label="Data types">
                  <DetailTags items={propertyDataTypes} />
                </InlineField>
              ) : null}
              {resolutionItems.length > 0 ? (
                <InlineField label="Data resolutions">
                  <DetailList items={resolutionItems} />
                </InlineField>
              ) : null}
            </div>
          </DetailSection>
        ) : null}

        <DetailSection title="Evidence">
          <List<Source>
            className="entity-detail-list"
            dataSource={sources}
            locale={{ emptyText: "No source recorded" }}
            renderItem={(source) => (
              <List.Item>
                <Flex vertical gap={2}>
                  <Typography.Text>{source.title}</Typography.Text>
                  <Typography.Text type="secondary">
                    {[source.publisher, source.sourceType].filter(Boolean).join(" · ")}
                  </Typography.Text>
                  {source.url ? (
                    <Typography.Link href={source.url} target="_blank" rel="noreferrer">
                      {source.url}
                    </Typography.Link>
                  ) : null}
                </Flex>
              </List.Item>
            )}
            size="small"
          />
        </DetailSection>

        <DetailSection title="Connections">
          <List<Relationship>
            className="entity-detail-list"
            dataSource={relationships}
            locale={{ emptyText: "No relationship recorded" }}
            renderItem={(relationship) => {
              const otherEntityId =
                relationship.sourceEntityId === entity.id
                  ? relationship.targetEntityId
                  : relationship.sourceEntityId;
              const otherEntity = graph.entityById[otherEntityId];
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
    </Card>
  );
}
