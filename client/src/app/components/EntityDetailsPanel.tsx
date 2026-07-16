import type { ReactNode } from "react";
import { CloseOutlined } from "@ant-design/icons";
import { Button, Card, Flex, List, Tag, Typography } from "antd";

import type {
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
  const sources = (graph.entitySourcesByEntityId[entity.id] ?? [])
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

  return (
    <Card
      className="entity-details-panel"
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
          {entity.description ? (
            <Typography.Paragraph className="entity-detail-note">
              {entity.description}
            </Typography.Paragraph>
          ) : null}
        </DetailSection>

        {isSystem ? (
          <>
            <DetailSection title="Data">
              <div className="entity-detail-grid">
                <InlineField label="Data types">
                  <ClaimTags claims={claimList(claims, "data_type")} />
                </InlineField>
                <InlineField label="Formats">
                  <ClaimTags claims={claimList(claims, "data_format")} />
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
