import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Flex,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Typography,
} from "antd";

import type { SavedView } from "../../../../shared/domain";
import {
  createSavedView,
  deleteSavedView,
  updateSavedView,
} from "../api";
import { useGraphStore } from "../state/graphStore";

function buildSavedViewPayload(state: ReturnType<typeof useGraphStore.getState>) {
  return {
    name: "",
    scope: state.focusEntityId ?? state.viewMode,
    filter: {
      viewMode: state.viewMode,
      focusEntityId: state.focusEntityId,
      countryDisplayMode: state.countryDisplayMode,
    },
    layout: {
      algorithm: state.layoutMode,
      displayMode: state.displayMode,
      viewport: state.viewport,
    },
    style: {},
  };
}

interface SavedViewsPanelProps {
  readOnly?: boolean;
}

export function SavedViewsPanel({ readOnly = false }: SavedViewsPanelProps) {
  const savedViews = useGraphStore((state) => state.savedViews);
  const setSavedViews = useGraphStore((state) => state.setSavedViews);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const setDisplayMode = useGraphStore((state) => state.setDisplayMode);
  const setLayoutMode = useGraphStore((state) => state.setLayoutMode);
  const setCountryDisplayMode = useGraphStore((state) => state.setCountryDisplayMode);
  const setFocusEntityId = useGraphStore((state) => state.setFocusEntityId);
  const [form] = Form.useForm<{ name: string }>();
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SavedView | null>(null);

  useEffect(() => {
    if (createOpen) {
      form.setFieldsValue({ name: "" });
      return;
    }

    if (renameTarget) {
      form.setFieldsValue({ name: renameTarget.name });
    }
  }, [createOpen, form, renameTarget]);

  async function handleCreate() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const state = useGraphStore.getState();
      const payload = buildSavedViewPayload(state);
      const savedView = await createSavedView({ ...payload, name: values.name.trim() });
      setSavedViews([savedView, ...savedViews]);
      setCreateOpen(false);
      form.resetFields();
    } finally {
      setSaving(false);
    }
  }

  async function handleRename() {
    if (!renameTarget) {
      return;
    }

    const values = await form.validateFields();
    setSaving(true);
    try {
      const updated = await updateSavedView(renameTarget.id, {
        name: values.name.trim(),
        scope: renameTarget.scope,
        filter: renameTarget.filter,
        layout: renameTarget.layout,
        style: renameTarget.style,
      });

      setSavedViews(
        savedViews.map((candidate) =>
          candidate.id === updated.id ? updated : candidate,
        ),
      );
      setRenameTarget(null);
      form.resetFields();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(savedView: SavedView) {
    await deleteSavedView(savedView.id);
    setSavedViews(savedViews.filter((candidate) => candidate.id !== savedView.id));
  }

  function applySavedView(savedView: SavedView) {
    const filter = savedView.filter as {
      viewMode?: "governance" | "country" | "technical";
      focusEntityId?: string | null;
      countryDisplayMode?: ReturnType<typeof useGraphStore.getState>["countryDisplayMode"];
    };
    const layout = savedView.layout as {
      algorithm?: ReturnType<typeof useGraphStore.getState>["layoutMode"];
      displayMode?: ReturnType<typeof useGraphStore.getState>["displayMode"];
    };

    if (filter.viewMode) {
      setViewMode(filter.viewMode);
    }
    if (filter.focusEntityId !== undefined) {
      setFocusEntityId(filter.focusEntityId);
    }
    if (filter.countryDisplayMode) {
      setCountryDisplayMode(filter.countryDisplayMode);
    }
    if (layout.algorithm) {
      setLayoutMode(layout.algorithm);
    }
    if (layout.displayMode) {
      setDisplayMode(layout.displayMode);
    }
  }

  return (
    <>
      <Card
        size="small"
        title="Saved Views"
        extra={
          !readOnly ? (
            <Button type="primary" size="small" onClick={() => setCreateOpen(true)}>
              Save current
            </Button>
          ) : null
        }
      >
        <List
          dataSource={savedViews}
          locale={{ emptyText: "No saved views yet." }}
          renderItem={(savedView) => (
            <List.Item
              actions={
                readOnly
                  ? []
                  : [
                      <Button
                        key="rename"
                        size="small"
                        type="text"
                        onClick={() => setRenameTarget(savedView)}
                      >
                        Rename
                      </Button>,
                      <Popconfirm
                        key="delete"
                        title="Delete saved view?"
                        onConfirm={() => handleDelete(savedView)}
                      >
                        <Button danger size="small" type="text">
                          Delete
                        </Button>
                      </Popconfirm>,
                    ]
              }
            >
              <Flex vertical gap={2}>
                <Button
                  type="link"
                  className="saved-view-link"
                  onClick={() => applySavedView(savedView)}
                >
                  {savedView.name}
                </Button>
                <Typography.Text type="secondary">
                  {savedView.scope}
                </Typography.Text>
              </Flex>
            </List.Item>
          )}
        />
      </Card>

      {!readOnly ? (
        <Modal
          open={createOpen}
          title="Save current view"
          okText="Save"
          confirmLoading={saving}
          onOk={() => void handleCreate()}
          onCancel={() => {
            setCreateOpen(false);
            form.resetFields();
          }}
        >
          <Form form={form} layout="vertical">
            <Form.Item
              label="Name"
              name="name"
              rules={[{ required: true, whitespace: true, message: "Enter a saved view name." }]}
            >
              <Input autoFocus />
            </Form.Item>
          </Form>
        </Modal>
      ) : null}

      {!readOnly ? (
        <Modal
          open={Boolean(renameTarget)}
          title="Rename saved view"
          okText="Rename"
          confirmLoading={saving}
          onOk={() => void handleRename()}
          onCancel={() => {
            setRenameTarget(null);
            form.resetFields();
          }}
        >
          <Form form={form} layout="vertical">
            <Form.Item
              label="Name"
              name="name"
              rules={[{ required: true, whitespace: true, message: "Enter a saved view name." }]}
            >
              <Input autoFocus />
            </Form.Item>
          </Form>
        </Modal>
      ) : null}
    </>
  );
}
