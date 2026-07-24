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
  List,
  Popconfirm,
  Select,
  Space,
  Typography,
} from "antd";

import type {
  GraphEdge,
  GraphEdgeInput,
  GraphNode,
  GraphNodeInput,
  GraphNodeKind,
  SourceInput,
} from "../../../../shared/domain";
import {
  createEdge,
  createNode,
  createSource,
  deleteEdge,
  deleteNode,
  deleteSource,
  fetchBootstrap,
  updateEdge,
  updateNode,
  updateSource,
} from "../api";
import { useGraphStore } from "../state/graphStore";

type EditorMode = "entity" | "relationship" | "source";

type MessageState = {
  kind: "success" | "error";
  text: string;
};

type PropertyDraft = {
  key: string;
  value: string;
};

type EntityDraft = {
  kind: GraphNodeKind;
  name: string;
  countryCode: string;
  subtype: string;
  properties: PropertyDraft[];
};

type RelationshipDraft = {
  sourceNodeId: string;
  targetNodeId: string;
  kind: GraphEdge["kind"];
  note: string;
  properties: PropertyDraft[];
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

const entityKindOptions = ["country", "organization", "system"] as const;
const relationshipTypeOptions = [
  "governs",
  "operates",
  "part_of",
  "publishes_to",
  "syncs_to",
] as const;

const blankEntityDraft = (): EntityDraft => ({
  kind: "organization",
  name: "",
  countryCode: "",
  subtype: "",
  properties: [],
});

const blankRelationshipDraft = (): RelationshipDraft => ({
  sourceNodeId: "",
  targetNodeId: "",
  kind: "publishes_to",
  note: "",
  properties: [],
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

function entityToDraft(entity: GraphNode): EntityDraft {
  return {
    kind: entity.kind,
    name: entity.name,
    countryCode: entity.countryCode ?? "",
    subtype: entity.subtype ?? "",
    properties: toPropertyDrafts(entity.properties ?? {}),
  };
}

function relationshipToDraft(relationship: GraphEdge): RelationshipDraft {
  return {
    sourceNodeId: relationship.sourceNodeId,
    targetNodeId: relationship.targetNodeId,
    kind: relationship.kind,
    note: relationship.note ?? "",
    properties: toPropertyDrafts(relationship.properties ?? {}),
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

interface EditorPanelProps {
  readOnly?: boolean;
}

export function EditorPanel({ readOnly = false }: EditorPanelProps) {
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
        ? [...graph.nodes]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((entity) => ({ label: entity.name, value: entity.id, kind: entity.kind }))
        : [],
    [graph],
  );

  useEffect(() => {
    if (!graph || !selectedEntityId) {
      return;
    }

    const entity = graph.nodeById[selectedEntityId];
    if (!entity) {
      return;
    }

    setMode("entity");
    setIsEditing(false);
    entityForm.setFieldsValue(entityToDraft(entity));
    setMessage(null);
  }, [entityForm, graph, selectedEntityId]);

  useEffect(() => {
    if (!graph || !selectedRelationshipId) {
      return;
    }

    const relationship = graph.edgeById[selectedRelationshipId];
    if (!relationship) {
      return;
    }

    setMode("relationship");
    setIsEditing(false);
    relationshipForm.setFieldsValue(relationshipToDraft(relationship));
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

  const selectedEntity = selectedEntityId ? graph.nodeById[selectedEntityId] : null;
  const selectedRelationship = selectedRelationshipId
    ? graph.edgeById[selectedRelationshipId]
    : null;
  const selectedSource = sourceEditorId ? graph.sourceById[sourceEditorId] : null;

  const viewingEntity = mode === "entity" ? selectedEntity : null;
  const viewingRelationship = mode === "relationship" ? selectedRelationship : null;
  const viewingSource = mode === "source" ? selectedSource : null;

  const entityProperties = viewingEntity ? toPropertyDrafts(viewingEntity.properties ?? {}) : [];
  const relationshipProperties = viewingRelationship
    ? toPropertyDrafts(viewingRelationship.properties ?? {})
    : [];
  const hasSelection = Boolean(viewingEntity || viewingRelationship || viewingSource);

  async function refreshGraph() {
    const payload = await fetchBootstrap();
    setBootstrap(payload);
  }

  function beginEdit() {
    setIsEditing(true);
    setMessage(null);
  }

  function cancelEdit() {
    setIsEditing(false);
    setMessage(null);

    if (viewingEntity) {
      entityForm.setFieldsValue(entityToDraft(viewingEntity));
      return;
    }

    if (viewingRelationship) {
      relationshipForm.setFieldsValue(relationshipToDraft(viewingRelationship));
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

  function startSourceEditor() {
    setMode("source");
    setIsEditing(!readOnly);
    setSourceEditorId(null);
    setSelectedEntityId(null);
    setSelectedRelationshipId(null);
    sourceForm.setFieldsValue(blankSourceDraft());
    setMessage(null);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      if (mode === "entity") {
        const values = await entityForm.validateFields();
        const payload: GraphNodeInput = {
          kind: values.kind,
          name: values.name.trim(),
          countryCode: values.countryCode.trim().toUpperCase() || null,
          subtype: values.subtype.trim() || null,
          properties: toPropertiesObject(values.properties ?? [], "entity"),
        };

        const entity = selectedEntityId
          ? await updateNode(selectedEntityId, payload)
          : await createNode(payload);
        await refreshGraph();
        setSelectedEntityId(entity.id);
        setMode("entity");
        setIsEditing(false);
        setMessage({ kind: "success", text: "Node saved." });
      } else if (mode === "relationship") {
        const values = await relationshipForm.validateFields();
        const payload: GraphEdgeInput = {
          sourceNodeId: values.sourceNodeId,
          targetNodeId: values.targetNodeId,
          kind: values.kind,
          note: values.note.trim() || null,
          properties: toPropertiesObject(values.properties ?? [], "relationship"),
        };

        const relationship = selectedRelationshipId
          ? await updateEdge(selectedRelationshipId, payload)
          : await createEdge(payload);
        await refreshGraph();
        setSelectedRelationshipId(relationship.id);
        setMode("relationship");
        setIsEditing(false);
        setMessage({ kind: "success", text: "Edge saved." });
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
        await deleteNode(selectedEntityId);
        await refreshGraph();
        setSelectedEntityId(null);
        entityForm.setFieldsValue(blankEntityDraft());
        setMessage({ kind: "success", text: "Node deleted." });
      } else if (mode === "relationship" && selectedRelationshipId) {
        await deleteEdge(selectedRelationshipId);
        await refreshGraph();
        setSelectedRelationshipId(null);
        relationshipForm.setFieldsValue(blankRelationshipDraft());
        setMessage({ kind: "success", text: "Edge deleted." });
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
      ? `${isEditing ? "Editing" : "Viewing"} edge: ${viewingRelationship.kind}`
      : viewingSource
        ? `${isEditing ? "Editing" : "Viewing"} source: ${viewingSource.title}`
        : isEditing
          ? mode === "relationship"
            ? "Creating a new edge."
            : mode === "source"
              ? "Editing a source record."
              : "Creating a new node."
          : readOnly
            ? "Click a node or edge in the graph to inspect it here."
            : "Click a node or edge in the graph to inspect it here.";

  const emptyStateMessage = readOnly
    ? "Select a node or edge to inspect it here."
    : "Select a node or edge, or create a new record.";

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
          {!readOnly && !isEditing && hasSelection ? (
            <Button size="small" type="primary" icon={<EditOutlined />} onClick={beginEdit}>
              Edit
            </Button>
          ) : null}
          {!readOnly ? (
            <>
              <Button size="small" icon={<PlusOutlined />} onClick={startNewEntity}>
                New node
              </Button>
              <Button size="small" onClick={startNewRelationship}>
                New edge
              </Button>
              <Button size="small" onClick={startSourceEditor}>
                Source
              </Button>
            </>
          ) : null}
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
            {emptyStateMessage}
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
                viewingEntity.countryCode
                  ? { key: "country", label: "Country", children: viewingEntity.countryCode }
                  : null,
                viewingEntity.subtype
                  ? { key: "subtype", label: "Subtype", children: viewingEntity.subtype }
                  : null,
              ].filter(Boolean) as NonNullable<
                Parameters<typeof Descriptions>[0]["items"]
              >}
            />
            <PropertyList properties={entityProperties} emptyText="No properties for this node." />
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
                    graph.nodeById[viewingRelationship.sourceNodeId]?.name ??
                    viewingRelationship.sourceNodeId,
                },
                {
                  key: "target",
                  label: "Target",
                  children:
                    graph.nodeById[viewingRelationship.targetNodeId]?.name ??
                    viewingRelationship.targetNodeId,
                },
                { key: "type", label: "Type", children: viewingRelationship.kind },
              ]}
            />
            {viewingRelationship.note ? (
              <Typography.Paragraph className="summary-copy">
                {viewingRelationship.note}
              </Typography.Paragraph>
            ) : null}
            <PropertyList properties={relationshipProperties} emptyText="No properties for this edge." />
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

        {!readOnly && isEditing && mode === "entity" ? (
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
            <Form.Item label="Country code" name="countryCode">
              <Input />
            </Form.Item>
            <Form.Item label="Subtype" name="subtype">
              <Input />
            </Form.Item>
            <PropertyEditor name="properties" emptyText="No properties for this node." />
          </Form>
        ) : null}

        {!readOnly && isEditing && mode === "relationship" ? (
          <Form form={relationshipForm} layout="vertical">
            <Form.Item
              label="Source node"
              name="sourceNodeId"
              rules={[{ required: true, message: "Select a source node." }]}
            >
              <Select allowClear options={entityOptions} />
            </Form.Item>
            <Form.Item
              label="Target node"
              name="targetNodeId"
              rules={[{ required: true, message: "Select a target node." }]}
            >
              <Select allowClear options={entityOptions} />
            </Form.Item>
            <Form.Item label="Type" name="kind" rules={[{ required: true }]}>
              <Select
                options={relationshipTypeOptions.map((type) => ({
                  label: type,
                  value: type,
                }))}
              />
            </Form.Item>
            <Form.Item label="Note" name="note">
              <Input.TextArea rows={3} />
            </Form.Item>
            <PropertyEditor name="properties" emptyText="No properties for this edge." />
          </Form>
        ) : null}

        {!readOnly && isEditing && mode === "source" ? (
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

        {!readOnly && isEditing ? (
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

function PropertyList({
  properties,
  emptyText,
}: {
  properties: PropertyDraft[];
  emptyText: string;
}) {
  return (
    <Collapse
      size="small"
      items={[
        {
          key: "properties",
          label: `Properties (${properties.length})`,
          children:
            properties.length > 0 ? (
              <List
                size="small"
                dataSource={properties}
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
              <Typography.Text type="secondary">{emptyText}</Typography.Text>
            ),
        },
      ]}
    />
  );
}

function PropertyEditor({
  name,
  emptyText,
}: {
  name: string;
  emptyText: string;
}) {
  return (
    <Collapse
      size="small"
      items={[
        {
          key: "properties",
          label: "Properties",
          children: (
            <Form.List name={name}>
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
                    <Typography.Text type="secondary">{emptyText}</Typography.Text>
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
      ]}
    />
  );
}
