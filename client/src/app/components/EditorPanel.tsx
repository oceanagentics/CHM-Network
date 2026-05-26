import { useEffect, useMemo, useState } from "react";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Flex,
  Form,
  Input,
  InputNumber,
  List,
  Popconfirm,
  Select,
  Space,
  Typography,
} from "antd";

import type {
  Entity,
  EntityInput,
  EntityKind,
  EntitySourceInput,
  Relationship,
  RelationshipInput,
  RelationshipSourceInput,
  SourceInput,
  Status,
} from "../../../../shared/domain";
import {
  createEntity,
  createRelationship,
  createSource,
  deleteEntity,
  deleteRelationship,
  deleteSource,
  fetchBootstrap,
  updateEntity,
  updateRelationship,
  updateSource,
} from "../api";
import { useGraphStore } from "../state/graphStore";

type EditorMode = "entity" | "relationship" | "source";

type MessageState = {
  kind: "success" | "error";
  text: string;
};

type SourceLinkDraft = {
  sourceId: string;
  claimType: string;
  excerpt: string;
  confidenceOverride: number | null;
};

type PropertyDraft = {
  key: string;
  value: string;
};

type EntityDraft = {
  kind: EntityKind;
  name: string;
  slug: string;
  parentEntityId: string;
  countryCode: string;
  subtype: string;
  status: Status;
  confidence: number;
  description: string;
  properties: PropertyDraft[];
  sources: SourceLinkDraft[];
};

type RelationshipDraft = {
  sourceEntityId: string;
  targetEntityId: string;
  type: Relationship["type"];
  status: Status;
  confidence: number;
  note: string;
  properties: PropertyDraft[];
  sources: SourceLinkDraft[];
};

type SourceDraft = {
  title: string;
  sourceType: string;
  url: string;
  localPath: string;
  publisher: string;
  publishedAt: string;
  accessedAt: string;
  note: string;
};

const statusOptions = ["active", "planned", "speculative", "deprecated"] as const;
const entityKindOptions = ["country", "organization", "system"] as const;
const relationshipTypeOptions = ["part_of", "operates", "publishes_to", "syncs_to"] as const;

const defaultLink = (sourceId = ""): SourceLinkDraft => ({
  sourceId,
  claimType: "supports_claim",
  excerpt: "",
  confidenceOverride: null,
});

const blankEntityDraft = (): EntityDraft => ({
  kind: "organization",
  name: "",
  slug: "",
  parentEntityId: "",
  countryCode: "",
  subtype: "",
  status: "active",
  confidence: 0.8,
  description: "",
  properties: [],
  sources: [],
});

const blankRelationshipDraft = (): RelationshipDraft => ({
  sourceEntityId: "",
  targetEntityId: "",
  type: "publishes_to",
  status: "active",
  confidence: 0.8,
  note: "",
  properties: [],
  sources: [],
});

const blankSourceDraft = (): SourceDraft => ({
  title: "",
  sourceType: "",
  url: "",
  localPath: "",
  publisher: "",
  publishedAt: "",
  accessedAt: "",
  note: "",
});

function toPropertyDrafts(properties: Record<string, unknown>): PropertyDraft[] {
  return Object.entries(properties).map(([key, value]) => ({
    key,
    value: typeof value === "string" ? value : JSON.stringify(value),
  }));
}

function parsePropertyValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "") {
    return "";
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function toPropertiesObject(drafts: PropertyDraft[], label: string): Record<string, unknown> {
  const properties: Record<string, unknown> = {};

  for (const draft of drafts) {
    const key = draft.key.trim();
    if (!key) {
      if (draft.value.trim()) {
        throw new Error(`${label} property keys cannot be blank`);
      }
      continue;
    }

    properties[key] = parsePropertyValue(draft.value);
  }

  return properties;
}

function toSourceLinks(draft: SourceLinkDraft[]): EntitySourceInput[] {
  return draft
    .filter((link) => link.sourceId)
    .map((link) => ({
      sourceId: link.sourceId,
      claimType: link.claimType.trim() || "supports_claim",
      excerpt: link.excerpt.trim() || null,
      confidenceOverride: link.confidenceOverride ?? null,
    }));
}

function toRelationshipSourceLinks(draft: SourceLinkDraft[]): RelationshipSourceInput[] {
  return draft
    .filter((link) => link.sourceId)
    .map((link) => ({
      sourceId: link.sourceId,
      claimType: link.claimType.trim() || "supports_claim",
      excerpt: link.excerpt.trim() || null,
      confidenceOverride: link.confidenceOverride ?? null,
    }));
}

function entityToDraft(entity: Entity, sources: EntitySourceInput[]): EntityDraft {
  return {
    kind: entity.kind,
    name: entity.name,
    slug: entity.slug ?? "",
    parentEntityId: entity.parentEntityId ?? "",
    countryCode: entity.countryCode ?? "",
    subtype: entity.subtype ?? "",
    status: entity.status,
    confidence: entity.confidence,
    description: entity.description ?? "",
    properties: toPropertyDrafts(entity.properties ?? {}),
    sources: sources.map((source) => ({
      sourceId: source.sourceId,
      claimType: source.claimType,
      excerpt: source.excerpt ?? "",
      confidenceOverride: source.confidenceOverride ?? null,
    })),
  };
}

function relationshipToDraft(
  relationship: Relationship,
  sources: RelationshipSourceInput[],
): RelationshipDraft {
  return {
    sourceEntityId: relationship.sourceEntityId,
    targetEntityId: relationship.targetEntityId,
    type: relationship.type,
    status: relationship.status,
    confidence: relationship.confidence,
    note: relationship.note ?? "",
    properties: toPropertyDrafts(relationship.properties ?? {}),
    sources: sources.map((source) => ({
      sourceId: source.sourceId,
      claimType: source.claimType,
      excerpt: source.excerpt ?? "",
      confidenceOverride: source.confidenceOverride ?? null,
    })),
  };
}

function sourceToDraft(source: {
  title: string;
  sourceType: string;
  url: string | null;
  localPath: string | null;
  publisher: string | null;
  publishedAt: string | null;
  accessedAt: string | null;
  note: string | null;
}): SourceDraft {
  return {
    title: source.title,
    sourceType: source.sourceType,
    url: source.url ?? "",
    localPath: source.localPath ?? "",
    publisher: source.publisher ?? "",
    publishedAt: source.publishedAt ?? "",
    accessedAt: source.accessedAt ?? "",
    note: source.note ?? "",
  };
}

function confidenceRule(label: string) {
  return {
    validator(_: unknown, value: number | null | undefined) {
      if (value == null || (value >= 0 && value <= 1)) {
        return Promise.resolve();
      }
      return Promise.reject(new Error(`${label} must be between 0 and 1`));
    },
  };
}

export function EditorPanel() {
  const graph = useGraphStore((state) => state.graph);
  const selectedEntityId = useGraphStore((state) => state.selectedEntityId);
  const selectedRelationshipId = useGraphStore((state) => state.selectedRelationshipId);
  const setSelectedEntityId = useGraphStore((state) => state.setSelectedEntityId);
  const setSelectedRelationshipId = useGraphStore((state) => state.setSelectedRelationshipId);
  const setBootstrap = useGraphStore((state) => state.setBootstrap);

  const [entityForm] = Form.useForm<EntityDraft>();
  const [relationshipForm] = Form.useForm<RelationshipDraft>();
  const [sourceForm] = Form.useForm<SourceDraft>();

  const [mode, setMode] = useState<EditorMode>("entity");
  const [sourceEditorId, setSourceEditorId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);

  const sourceOptions = useMemo(
    () =>
      graph
        ? [...graph.sources]
            .sort((a, b) => a.title.localeCompare(b.title))
            .map((source) => ({ label: source.title, value: source.id }))
        : [],
    [graph],
  );
  const entityOptions = useMemo(
    () =>
      graph
        ? [...graph.entities]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((entity) => ({ label: entity.name, value: entity.id, kind: entity.kind }))
        : [],
    [graph],
  );

  const entityKind = Form.useWatch("kind", entityForm);

  useEffect(() => {
    if (!graph || !selectedEntityId) {
      return;
    }

    const entity = graph.entityById[selectedEntityId];
    if (!entity) {
      return;
    }

    setMode("entity");
    setIsEditing(false);
    entityForm.setFieldsValue(
      entityToDraft(
        entity,
        (graph.entitySourcesByEntityId[selectedEntityId] ?? []).map((source) => ({
          sourceId: source.sourceId,
          claimType: source.claimType,
          excerpt: source.excerpt,
          confidenceOverride: source.confidenceOverride,
        })),
      ),
    );
    setMessage(null);
  }, [entityForm, graph, selectedEntityId]);

  useEffect(() => {
    if (!graph || !selectedRelationshipId) {
      return;
    }

    const relationship = graph.relationshipById[selectedRelationshipId];
    if (!relationship) {
      return;
    }

    setMode("relationship");
    setIsEditing(false);
    relationshipForm.setFieldsValue(
      relationshipToDraft(
        relationship,
        (graph.relationshipSourcesByRelationshipId[selectedRelationshipId] ?? []).map(
          (source) => ({
            sourceId: source.sourceId,
            claimType: source.claimType,
            excerpt: source.excerpt,
            confidenceOverride: source.confidenceOverride,
          }),
        ),
      ),
    );
    setMessage(null);
  }, [graph, relationshipForm, selectedRelationshipId]);

  useEffect(() => {
    if (!graph || !sourceEditorId) {
      return;
    }

    const source = graph.sourceById[sourceEditorId];
    if (!source) {
      return;
    }

    setMode("source");
    sourceForm.setFieldsValue(sourceToDraft(source));
    setMessage(null);
  }, [graph, sourceEditorId, sourceForm]);

  if (!graph) {
    return null;
  }

  const selectedEntity = selectedEntityId ? graph.entityById[selectedEntityId] : null;
  const selectedRelationship = selectedRelationshipId
    ? graph.relationshipById[selectedRelationshipId]
    : null;
  const selectedSource = sourceEditorId ? graph.sourceById[sourceEditorId] : null;

  const viewingEntity = mode === "entity" ? selectedEntity : null;
  const viewingRelationship = mode === "relationship" ? selectedRelationship : null;
  const viewingSource = mode === "source" ? selectedSource : null;

  const entityProperties = viewingEntity ? toPropertyDrafts(viewingEntity.properties ?? {}) : [];
  const relationshipProperties = viewingRelationship
    ? toPropertyDrafts(viewingRelationship.properties ?? {})
    : [];
  const entitySources = viewingEntity
    ? graph.entitySourcesByEntityId[viewingEntity.id] ?? []
    : [];
  const relationshipSources = viewingRelationship
    ? graph.relationshipSourcesByRelationshipId[viewingRelationship.id] ?? []
    : [];
  const hasSelection = Boolean(viewingEntity || viewingRelationship || viewingSource);

  async function refreshGraph() {
    const payload = await fetchBootstrap();
    setBootstrap(payload);
  }

  function openSourceEditor(sourceId: string) {
    setSourceEditorId(sourceId);
    setMode("source");
    setIsEditing(true);
    setMessage(null);
  }

  function beginEdit() {
    setIsEditing(true);
    setMessage(null);
  }

  function cancelEdit() {
    const currentGraph = graph;
    if (!currentGraph) {
      return;
    }

    setIsEditing(false);
    setMessage(null);

    if (viewingEntity) {
      entityForm.setFieldsValue(
        entityToDraft(
          viewingEntity,
          (currentGraph.entitySourcesByEntityId[viewingEntity.id] ?? []).map((source) => ({
            sourceId: source.sourceId,
            claimType: source.claimType,
            excerpt: source.excerpt,
            confidenceOverride: source.confidenceOverride,
          })),
        ),
      );
      return;
    }

    if (viewingRelationship) {
      relationshipForm.setFieldsValue(
        relationshipToDraft(
          viewingRelationship,
          (currentGraph.relationshipSourcesByRelationshipId[viewingRelationship.id] ?? []).map(
            (source) => ({
              sourceId: source.sourceId,
              claimType: source.claimType,
              excerpt: source.excerpt,
              confidenceOverride: source.confidenceOverride,
            }),
          ),
        ),
      );
      return;
    }

    if (viewingSource) {
      sourceForm.setFieldsValue(sourceToDraft(viewingSource));
      return;
    }

    entityForm.setFieldsValue(blankEntityDraft());
    relationshipForm.setFieldsValue(blankRelationshipDraft());
    sourceForm.setFieldsValue(blankSourceDraft());
  }

  function startNewEntity() {
    setMode("entity");
    setIsEditing(true);
    setSourceEditorId(null);
    setSelectedEntityId(null);
    setSelectedRelationshipId(null);
    entityForm.setFieldsValue(blankEntityDraft());
    setMessage(null);
  }

  function startNewRelationship() {
    setMode("relationship");
    setIsEditing(true);
    setSourceEditorId(null);
    setSelectedEntityId(null);
    setSelectedRelationshipId(null);
    relationshipForm.setFieldsValue(blankRelationshipDraft());
    setMessage(null);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      if (mode === "entity") {
        const values = await entityForm.validateFields();
        const payload: EntityInput = {
          kind: values.kind,
          name: values.name.trim(),
          slug: values.slug.trim() || null,
          parentEntityId: values.kind === "organization" ? values.parentEntityId || null : null,
          countryCode: values.countryCode.trim().toUpperCase() || null,
          subtype: values.subtype.trim() || null,
          status: values.status,
          confidence: values.confidence,
          description: values.description.trim() || null,
          properties: toPropertiesObject(values.properties ?? [], "entity"),
          sources: toSourceLinks(values.sources ?? []),
        };

        const entity = selectedEntityId
          ? await updateEntity(selectedEntityId, payload)
          : await createEntity(payload);
        await refreshGraph();
        setSelectedEntityId(entity.id);
        setMode("entity");
        setIsEditing(false);
        setMessage({ kind: "success", text: "Entity saved." });
      } else if (mode === "relationship") {
        const values = await relationshipForm.validateFields();
        const payload: RelationshipInput = {
          sourceEntityId: values.sourceEntityId,
          targetEntityId: values.targetEntityId,
          type: values.type,
          status: values.status,
          confidence: values.confidence,
          note: values.note.trim() || null,
          properties: toPropertiesObject(values.properties ?? [], "relationship"),
          sources: toRelationshipSourceLinks(values.sources ?? []),
        };

        const relationship = selectedRelationshipId
          ? await updateRelationship(selectedRelationshipId, payload)
          : await createRelationship(payload);
        await refreshGraph();
        setSelectedRelationshipId(relationship.id);
        setMode("relationship");
        setIsEditing(false);
        setMessage({ kind: "success", text: "Relationship saved." });
      } else {
        const values = await sourceForm.validateFields();
        const payload: SourceInput = {
          title: values.title.trim(),
          sourceType: values.sourceType.trim(),
          url: values.url.trim() || null,
          localPath: values.localPath.trim() || null,
          publisher: values.publisher.trim() || null,
          publishedAt: values.publishedAt.trim() || null,
          accessedAt: values.accessedAt.trim() || null,
          note: values.note.trim() || null,
        };

        const source = sourceEditorId
          ? await updateSource(sourceEditorId, payload)
          : await createSource(payload);
        await refreshGraph();
        setSourceEditorId(source.id);
        setMode("source");
        setIsEditing(false);
        setMessage({ kind: "success", text: "Source saved." });
      }
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Save failed.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    setMessage(null);

    try {
      if (mode === "entity" && selectedEntityId) {
        await deleteEntity(selectedEntityId);
        await refreshGraph();
        setSelectedEntityId(null);
        entityForm.setFieldsValue(blankEntityDraft());
        setMessage({ kind: "success", text: "Entity deleted." });
      } else if (mode === "relationship" && selectedRelationshipId) {
        await deleteRelationship(selectedRelationshipId);
        await refreshGraph();
        setSelectedRelationshipId(null);
        relationshipForm.setFieldsValue(blankRelationshipDraft());
        setMessage({ kind: "success", text: "Relationship deleted." });
      } else if (mode === "source" && sourceEditorId) {
        await deleteSource(sourceEditorId);
        await refreshGraph();
        setSourceEditorId(null);
        sourceForm.setFieldsValue(blankSourceDraft());
        setMessage({ kind: "success", text: "Source deleted." });
      }
      setIsEditing(false);
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Delete failed.",
      });
    } finally {
      setSaving(false);
    }
  }

  const contextMessage = viewingEntity
    ? `${isEditing ? "Editing" : "Viewing"} node: ${viewingEntity.name}`
    : viewingRelationship
      ? `${isEditing ? "Editing" : "Viewing"} edge: ${viewingRelationship.type}`
      : viewingSource
        ? `${isEditing ? "Editing" : "Viewing"} source: ${viewingSource.title}`
        : isEditing
          ? mode === "relationship"
            ? "Creating a new edge."
            : mode === "source"
              ? "Editing a source record."
              : "Creating a new node."
          : "Click a node or edge in the graph to inspect it here.";

  const canDelete =
    (mode === "entity" && Boolean(selectedEntityId)) ||
    (mode === "relationship" && Boolean(selectedRelationshipId)) ||
    (mode === "source" && Boolean(sourceEditorId));

  return (
    <Card
      size="small"
      title="Editor"
      extra={
        <Space size={6}>
          {!isEditing && hasSelection ? (
            <Button size="small" type="primary" icon={<EditOutlined />} onClick={beginEdit}>
              Edit
            </Button>
          ) : null}
          <Button size="small" icon={<PlusOutlined />} onClick={startNewEntity}>
            New entity
          </Button>
          <Button size="small" onClick={startNewRelationship}>
            New edge
          </Button>
        </Space>
      }
    >
      <Flex vertical gap={12}>
        <Typography.Text type="secondary">{contextMessage}</Typography.Text>

        {message ? (
          <Alert
            showIcon
            type={message.kind}
            message={message.text}
          />
        ) : null}

        {!isEditing && !hasSelection ? (
          <Typography.Text type="secondary">
            Select a node or edge, or create a new record.
          </Typography.Text>
        ) : null}

        {!isEditing && viewingEntity ? (
          <Flex vertical gap={12}>
            <Descriptions
              bordered
              column={1}
              size="small"
              items={[
                { key: "kind", label: "Kind", children: viewingEntity.kind },
                viewingEntity.parentEntityId
                  ? {
                      key: "parent",
                      label: "Parent",
                      children:
                        graph.entityById[viewingEntity.parentEntityId]?.name ??
                        viewingEntity.parentEntityId,
                    }
                  : null,
                viewingEntity.countryCode
                  ? { key: "country", label: "Country", children: viewingEntity.countryCode }
                  : null,
                viewingEntity.subtype
                  ? { key: "subtype", label: "Subtype", children: viewingEntity.subtype }
                  : null,
                viewingEntity.slug
                  ? { key: "slug", label: "Slug", children: viewingEntity.slug }
                  : null,
                { key: "status", label: "Status", children: viewingEntity.status },
                { key: "confidence", label: "Confidence", children: viewingEntity.confidence },
              ].filter(Boolean) as NonNullable<
                Parameters<typeof Descriptions>[0]["items"]
              >}
            />
            {viewingEntity.description ? (
              <Typography.Paragraph className="summary-copy">
                {viewingEntity.description}
              </Typography.Paragraph>
            ) : null}
            <Collapse
              size="small"
              items={[
                {
                  key: "properties",
                  label: `Properties (${entityProperties.length})`,
                  children:
                    entityProperties.length > 0 ? (
                      <List
                        size="small"
                        dataSource={entityProperties}
                        renderItem={(property) => (
                          <List.Item>
                            <Flex vertical gap={2}>
                              <Typography.Text strong>{property.key}</Typography.Text>
                              <Typography.Text type="secondary">
                                {property.value}
                              </Typography.Text>
                            </Flex>
                          </List.Item>
                        )}
                      />
                    ) : (
                      <Typography.Text type="secondary">
                        No properties for this node.
                      </Typography.Text>
                    ),
                },
                {
                  key: "sources",
                  label: `Sources (${entitySources.length})`,
                  children:
                    entitySources.length > 0 ? (
                      <List
                        size="small"
                        dataSource={entitySources}
                        renderItem={(source) => (
                          <List.Item
                            actions={[
                              <Button
                                key="open"
                                size="small"
                                type="link"
                                onClick={() => openSourceEditor(source.sourceId)}
                              >
                                Edit source
                              </Button>,
                            ]}
                          >
                            <Flex vertical gap={2}>
                              <Typography.Text strong>
                                {graph.sourceById[source.sourceId]?.title ?? source.sourceId}
                              </Typography.Text>
                              <Typography.Text type="secondary">
                                {source.claimType}
                              </Typography.Text>
                              {source.excerpt ? (
                                <Typography.Text type="secondary">
                                  {source.excerpt}
                                </Typography.Text>
                              ) : null}
                            </Flex>
                          </List.Item>
                        )}
                      />
                    ) : (
                      <Typography.Text type="secondary">
                        No provenance links for this node.
                      </Typography.Text>
                    ),
                },
              ]}
            />
          </Flex>
        ) : null}

        {!isEditing && viewingRelationship ? (
          <Flex vertical gap={12}>
            <Descriptions
              bordered
              column={1}
              size="small"
              items={[
                {
                  key: "source",
                  label: "Source",
                  children:
                    graph.entityById[viewingRelationship.sourceEntityId]?.name ??
                    viewingRelationship.sourceEntityId,
                },
                {
                  key: "target",
                  label: "Target",
                  children:
                    graph.entityById[viewingRelationship.targetEntityId]?.name ??
                    viewingRelationship.targetEntityId,
                },
                { key: "type", label: "Type", children: viewingRelationship.type },
                { key: "status", label: "Status", children: viewingRelationship.status },
                {
                  key: "confidence",
                  label: "Confidence",
                  children: viewingRelationship.confidence,
                },
              ]}
            />
            {viewingRelationship.note ? (
              <Typography.Paragraph className="summary-copy">
                {viewingRelationship.note}
              </Typography.Paragraph>
            ) : null}
            <Collapse
              size="small"
              items={[
                {
                  key: "properties",
                  label: `Properties (${relationshipProperties.length})`,
                  children:
                    relationshipProperties.length > 0 ? (
                      <List
                        size="small"
                        dataSource={relationshipProperties}
                        renderItem={(property) => (
                          <List.Item>
                            <Flex vertical gap={2}>
                              <Typography.Text strong>{property.key}</Typography.Text>
                              <Typography.Text type="secondary">
                                {property.value}
                              </Typography.Text>
                            </Flex>
                          </List.Item>
                        )}
                      />
                    ) : (
                      <Typography.Text type="secondary">
                        No properties for this edge.
                      </Typography.Text>
                    ),
                },
                {
                  key: "sources",
                  label: `Sources (${relationshipSources.length})`,
                  children:
                    relationshipSources.length > 0 ? (
                      <List
                        size="small"
                        dataSource={relationshipSources}
                        renderItem={(source) => (
                          <List.Item
                            actions={[
                              <Button
                                key="open"
                                size="small"
                                type="link"
                                onClick={() => openSourceEditor(source.sourceId)}
                              >
                                Edit source
                              </Button>,
                            ]}
                          >
                            <Flex vertical gap={2}>
                              <Typography.Text strong>
                                {graph.sourceById[source.sourceId]?.title ?? source.sourceId}
                              </Typography.Text>
                              <Typography.Text type="secondary">
                                {source.claimType}
                              </Typography.Text>
                              {source.excerpt ? (
                                <Typography.Text type="secondary">
                                  {source.excerpt}
                                </Typography.Text>
                              ) : null}
                            </Flex>
                          </List.Item>
                        )}
                      />
                    ) : (
                      <Typography.Text type="secondary">
                        No provenance links for this edge.
                      </Typography.Text>
                    ),
                },
              ]}
            />
          </Flex>
        ) : null}

        {!isEditing && viewingSource ? (
          <Descriptions
            bordered
            column={1}
            size="small"
            items={[
              { key: "type", label: "Type", children: viewingSource.sourceType },
              viewingSource.url ? { key: "url", label: "URL", children: viewingSource.url } : null,
              viewingSource.localPath
                ? { key: "path", label: "Local path", children: viewingSource.localPath }
                : null,
              viewingSource.publisher
                ? { key: "publisher", label: "Publisher", children: viewingSource.publisher }
                : null,
              viewingSource.publishedAt
                ? { key: "published", label: "Published", children: viewingSource.publishedAt }
                : null,
              viewingSource.accessedAt
                ? { key: "accessed", label: "Accessed", children: viewingSource.accessedAt }
                : null,
              viewingSource.note
                ? { key: "note", label: "Note", children: viewingSource.note }
                : null,
            ].filter(Boolean) as NonNullable<Parameters<typeof Descriptions>[0]["items"]>}
          />
        ) : null}

        {isEditing && mode === "entity" ? (
          <Form form={entityForm} layout="vertical">
            <Form.Item label="Kind" name="kind" rules={[{ required: true }]}>
              <Select
                options={entityKindOptions.map((kind) => ({ label: kind, value: kind }))}
              />
            </Form.Item>
            <Form.Item
              label="Name"
              name="name"
              rules={[{ required: true, whitespace: true, message: "Enter a name." }]}
            >
              <Input />
            </Form.Item>
            <Form.Item label="Slug" name="slug">
              <Input />
            </Form.Item>
            {entityKind === "organization" ? (
              <Form.Item label="Parent" name="parentEntityId">
                <Select
                  allowClear
                  options={entityOptions.filter(
                    (entity) =>
                      entity.kind === "country" || entity.kind === "organization",
                  )}
                />
              </Form.Item>
            ) : null}
            <Form.Item label="Country code" name="countryCode">
              <Input />
            </Form.Item>
            <Form.Item label="Subtype" name="subtype">
              <Input />
            </Form.Item>
            <Flex gap={12}>
              <Form.Item className="half-width" label="Status" name="status" rules={[{ required: true }]}>
                <Select
                  options={statusOptions.map((status) => ({ label: status, value: status }))}
                />
              </Form.Item>
              <Form.Item
                className="half-width"
                label="Confidence"
                name="confidence"
                rules={[{ required: true }, confidenceRule("Entity confidence")]}
              >
                <InputNumber className="full-width" min={0} max={1} step={0.05} />
              </Form.Item>
            </Flex>
            <Form.Item label="Description" name="description">
              <Input.TextArea rows={3} />
            </Form.Item>
            <Collapse
              size="small"
              items={[
                {
                  key: "properties",
                  label: "Properties",
                  children: (
                    <Form.List name="properties">
                      {(fields, { add, remove }) => (
                        <Flex vertical gap={10}>
                          <Button
                            size="small"
                            type="dashed"
                            icon={<PlusOutlined />}
                            onClick={() => add({ key: "", value: "" })}
                          >
                            Add property
                          </Button>
                          {fields.length === 0 ? (
                            <Typography.Text type="secondary">
                              No properties for this node.
                            </Typography.Text>
                          ) : null}
                          {fields.map((field) => (
                            <Card key={field.key} size="small" className="editor-subcard">
                              <Form.Item
                                label="Key"
                                name={[field.name, "key"]}
                                style={{ marginBottom: 10 }}
                              >
                                <Input />
                              </Form.Item>
                              <Form.Item label="Value" name={[field.name, "value"]}>
                                <Input.TextArea rows={2} />
                              </Form.Item>
                              <Button danger size="small" type="text" onClick={() => remove(field.name)}>
                                Remove
                              </Button>
                            </Card>
                          ))}
                        </Flex>
                      )}
                    </Form.List>
                  ),
                },
                {
                  key: "sources",
                  label: "Sources",
                  children: (
                    <Form.List name="sources">
                      {(fields, { add, remove }) => (
                        <Flex vertical gap={10}>
                          <Button
                            size="small"
                            type="dashed"
                            icon={<PlusOutlined />}
                            onClick={() => add(defaultLink(sourceOptions[0]?.value ?? ""))}
                          >
                            Add source
                          </Button>
                          {fields.map((field) => (
                            <Card key={field.key} size="small" className="editor-subcard">
                              <Form.Item
                                label="Source"
                                name={[field.name, "sourceId"]}
                                rules={[{ required: true, message: "Select a source." }]}
                                style={{ marginBottom: 10 }}
                              >
                                <Select allowClear options={sourceOptions} />
                              </Form.Item>
                              <Form.Item label="Claim type" name={[field.name, "claimType"]}>
                                <Input />
                              </Form.Item>
                              <Form.Item label="Excerpt" name={[field.name, "excerpt"]}>
                                <Input.TextArea rows={2} />
                              </Form.Item>
                              <Form.Item
                                label="Confidence override"
                                name={[field.name, "confidenceOverride"]}
                                rules={[confidenceRule("Source confidence")]}
                              >
                                <InputNumber className="full-width" min={0} max={1} step={0.05} />
                              </Form.Item>
                              <Button danger size="small" type="text" onClick={() => remove(field.name)}>
                                Remove
                              </Button>
                            </Card>
                          ))}
                        </Flex>
                      )}
                    </Form.List>
                  ),
                },
              ]}
            />
          </Form>
        ) : null}

        {isEditing && mode === "relationship" ? (
          <Form form={relationshipForm} layout="vertical">
            <Form.Item
              label="Source entity"
              name="sourceEntityId"
              rules={[{ required: true, message: "Select a source entity." }]}
            >
              <Select allowClear options={entityOptions} />
            </Form.Item>
            <Form.Item
              label="Target entity"
              name="targetEntityId"
              rules={[{ required: true, message: "Select a target entity." }]}
            >
              <Select allowClear options={entityOptions} />
            </Form.Item>
            <Form.Item label="Type" name="type" rules={[{ required: true }]}>
              <Select
                options={relationshipTypeOptions.map((type) => ({
                  label: type,
                  value: type,
                }))}
              />
            </Form.Item>
            <Flex gap={12}>
              <Form.Item className="half-width" label="Status" name="status" rules={[{ required: true }]}>
                <Select
                  options={statusOptions.map((status) => ({ label: status, value: status }))}
                />
              </Form.Item>
              <Form.Item
                className="half-width"
                label="Confidence"
                name="confidence"
                rules={[{ required: true }, confidenceRule("Relationship confidence")]}
              >
                <InputNumber className="full-width" min={0} max={1} step={0.05} />
              </Form.Item>
            </Flex>
            <Form.Item label="Note" name="note">
              <Input.TextArea rows={3} />
            </Form.Item>
            <Collapse
              size="small"
              items={[
                {
                  key: "properties",
                  label: "Properties",
                  children: (
                    <Form.List name="properties">
                      {(fields, { add, remove }) => (
                        <Flex vertical gap={10}>
                          <Button
                            size="small"
                            type="dashed"
                            icon={<PlusOutlined />}
                            onClick={() => add({ key: "", value: "" })}
                          >
                            Add property
                          </Button>
                          {fields.length === 0 ? (
                            <Typography.Text type="secondary">
                              No properties for this edge.
                            </Typography.Text>
                          ) : null}
                          {fields.map((field) => (
                            <Card key={field.key} size="small" className="editor-subcard">
                              <Form.Item
                                label="Key"
                                name={[field.name, "key"]}
                                style={{ marginBottom: 10 }}
                              >
                                <Input />
                              </Form.Item>
                              <Form.Item label="Value" name={[field.name, "value"]}>
                                <Input.TextArea rows={2} />
                              </Form.Item>
                              <Button danger size="small" type="text" onClick={() => remove(field.name)}>
                                Remove
                              </Button>
                            </Card>
                          ))}
                        </Flex>
                      )}
                    </Form.List>
                  ),
                },
                {
                  key: "sources",
                  label: "Sources",
                  children: (
                    <Form.List name="sources">
                      {(fields, { add, remove }) => (
                        <Flex vertical gap={10}>
                          <Button
                            size="small"
                            type="dashed"
                            icon={<PlusOutlined />}
                            onClick={() => add(defaultLink(sourceOptions[0]?.value ?? ""))}
                          >
                            Add source
                          </Button>
                          {fields.map((field) => (
                            <Card key={field.key} size="small" className="editor-subcard">
                              <Form.Item
                                label="Source"
                                name={[field.name, "sourceId"]}
                                rules={[{ required: true, message: "Select a source." }]}
                                style={{ marginBottom: 10 }}
                              >
                                <Select allowClear options={sourceOptions} />
                              </Form.Item>
                              <Form.Item label="Claim type" name={[field.name, "claimType"]}>
                                <Input />
                              </Form.Item>
                              <Form.Item label="Excerpt" name={[field.name, "excerpt"]}>
                                <Input.TextArea rows={2} />
                              </Form.Item>
                              <Form.Item
                                label="Confidence override"
                                name={[field.name, "confidenceOverride"]}
                                rules={[confidenceRule("Source confidence")]}
                              >
                                <InputNumber className="full-width" min={0} max={1} step={0.05} />
                              </Form.Item>
                              <Button danger size="small" type="text" onClick={() => remove(field.name)}>
                                Remove
                              </Button>
                            </Card>
                          ))}
                        </Flex>
                      )}
                    </Form.List>
                  ),
                },
              ]}
            />
          </Form>
        ) : null}

        {isEditing && mode === "source" ? (
          <Form form={sourceForm} layout="vertical">
            <Form.Item label="Edit source">
              <Select
                allowClear
                value={sourceEditorId ?? undefined}
                placeholder="New source"
                options={sourceOptions}
                onChange={(value) => {
                  const nextId = value ?? null;
                  setSourceEditorId(nextId);
                  if (!nextId) {
                    sourceForm.setFieldsValue(blankSourceDraft());
                  }
                }}
              />
            </Form.Item>
            <Form.Item
              label="Title"
              name="title"
              rules={[{ required: true, whitespace: true, message: "Enter a title." }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label="Source type"
              name="sourceType"
              rules={[{ required: true, whitespace: true, message: "Enter a source type." }]}
            >
              <Input />
            </Form.Item>
            <Form.Item label="URL" name="url">
              <Input />
            </Form.Item>
            <Form.Item label="Local path" name="localPath">
              <Input />
            </Form.Item>
            <Form.Item label="Publisher" name="publisher">
              <Input />
            </Form.Item>
            <Flex gap={12}>
              <Form.Item className="half-width" label="Published" name="publishedAt">
                <Input />
              </Form.Item>
              <Form.Item className="half-width" label="Accessed" name="accessedAt">
                <Input />
              </Form.Item>
            </Flex>
            <Form.Item label="Note" name="note">
              <Input.TextArea rows={4} />
            </Form.Item>
          </Form>
        ) : null}

        {isEditing ? (
          <Flex justify="space-between" align="center" gap={12} wrap>
            <Space>
              <Button icon={<SaveOutlined />} loading={saving} type="primary" onClick={() => void handleSave()}>
                Save
              </Button>
              <Button onClick={cancelEdit}>Cancel</Button>
            </Space>
            <Popconfirm
              title="Delete this record?"
              disabled={!canDelete}
              onConfirm={() => void handleDelete()}
            >
              <Button danger disabled={!canDelete || saving} icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Popconfirm>
          </Flex>
        ) : null}
      </Flex>
    </Card>
  );
}
