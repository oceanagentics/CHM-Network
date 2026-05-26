import { useEffect, useMemo } from "react";
import {
  Alert,
  Card,
  Flex,
  Layout,
  Select,
  Segmented,
  Spin,
  Typography,
} from "antd";

import type { Entity } from "../../../shared/domain";
import { fetchBootstrap } from "./api";
import { EditorPanel } from "./components/EditorPanel";
import { GraphCanvas } from "./components/GraphCanvas";
import { LegendPanel } from "./components/LegendPanel";
import { SavedViewsPanel } from "./components/SavedViewsPanel";
import { isPublicApp } from "./config";
import { graphLayouts, useGraphStore } from "./state/graphStore";

const { Content, Sider } = Layout;
const { Text } = Typography;

function entityOptions(viewMode: "governance" | "country" | "technical", entities: Entity[]) {
  if (viewMode === "technical") {
    return entities.filter((entity) => entity.kind === "system");
  }

  if (viewMode === "country") {
    return entities.filter((entity) => entity.kind === "country" || entity.kind === "organization");
  }

  return entities;
}

export function App() {
  const graph = useGraphStore((state) => state.graph);
  const loading = useGraphStore((state) => state.loading);
  const error = useGraphStore((state) => state.error);
  const viewMode = useGraphStore((state) => state.viewMode);
  const layoutMode = useGraphStore((state) => state.layoutMode);
  const countryDisplayMode = useGraphStore((state) => state.countryDisplayMode);
  const focusEntityId = useGraphStore((state) => state.focusEntityId);
  const setBootstrap = useGraphStore((state) => state.setBootstrap);
  const setError = useGraphStore((state) => state.setError);
  const setLoading = useGraphStore((state) => state.setLoading);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const setLayoutMode = useGraphStore((state) => state.setLayoutMode);
  const setCountryDisplayMode = useGraphStore((state) => state.setCountryDisplayMode);
  const setFocusEntityId = useGraphStore((state) => state.setFocusEntityId);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchBootstrap()
      .then((payload) => {
        if (!mounted) {
          return;
        }
        setBootstrap(payload);
      })
      .catch((caughtError) => {
        if (!mounted) {
          return;
        }
        setError(caughtError instanceof Error ? caughtError.message : "Failed to load graph");
      });

    return () => {
      mounted = false;
    };
  }, [setBootstrap, setError, setLoading]);

  const focusOptions = useMemo(() => {
    if (!graph) {
      return [];
    }

    return entityOptions(viewMode, graph.entities)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entity) => ({
        label: entity.name,
        value: entity.id,
      }));
  }, [graph, viewMode]);

  if (loading) {
    return (
      <Flex className="app-shell" align="center" justify="center">
        <Spin size="large" tip="Loading graph data…" />
      </Flex>
    );
  }

  if (error) {
    return (
      <Flex className="app-shell app-state" align="center" justify="center">
        <Alert
          message="Graph load failed"
          description={error}
          type="error"
          showIcon
        />
      </Flex>
    );
  }

  return (
    <Layout className="app-shell app-layout">
      <Sider width={420} className="left-rail" theme="light">
        <Flex vertical gap={12} className="left-rail-stack">
          <Card size="small" title="View Controls">
            <Flex vertical gap={12}>
              <div>
                <Text type="secondary">View</Text>
                <Select
                  className="full-width"
                  value={viewMode}
                  options={[
                    { label: "Governance", value: "governance" },
                    { label: "Country", value: "country" },
                    { label: "Technical", value: "technical" },
                  ]}
                  onChange={(value) => setViewMode(value)}
                />
              </div>
              <div>
                <Text type="secondary">Focus</Text>
                <Select
                  allowClear
                  className="full-width"
                  value={focusEntityId ?? undefined}
                  placeholder="Auto"
                  options={focusOptions}
                  onChange={(value) => setFocusEntityId(value ?? null)}
                />
              </div>
              <div>
                <Text type="secondary">Layout</Text>
                <Select
                  className="full-width"
                  value={layoutMode}
                  options={graphLayouts.map((layout) => ({
                    label: layout,
                    value: layout,
                  }))}
                  onChange={(value) => setLayoutMode(value)}
                />
              </div>
              <div>
                <Text type="secondary">Country Display</Text>
                <Segmented
                  block
                  value={countryDisplayMode}
                  options={[
                    { label: "Node", value: "node" },
                    { label: "Engulf children", value: "engulf" },
                  ]}
                  onChange={(value) =>
                    setCountryDisplayMode(value as typeof countryDisplayMode)
                  }
                />
              </div>
            </Flex>
          </Card>
          <EditorPanel readOnly={isPublicApp} />
          <LegendPanel />
          <SavedViewsPanel readOnly={isPublicApp} />
        </Flex>
      </Sider>
      <Content className="graph-panel">
        <div className="graph-surface">
          <GraphCanvas />
        </div>
      </Content>
    </Layout>
  );
}
