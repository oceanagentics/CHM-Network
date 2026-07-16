import type { MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
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
import { EntityDetailsPanel } from "./components/EntityDetailsPanel";
import { GlobeCanvas } from "./components/GlobeCanvas";
import { GraphCanvas } from "./components/GraphCanvas";
import { SavedViewsPanel } from "./components/SavedViewsPanel";
import { SystemDirectoryView } from "./components/SystemDirectoryView";
import { isPublicApp } from "./config";
import { graphLayouts, useGraphStore } from "./state/graphStore";

const { Content, Header, Sider } = Layout;
const { Text } = Typography;

type AppRoute = "network-diagram" | "node-map" | "globe" | "systems";

const routeHash = {
  "network-diagram": "#/",
  "node-map": "#/node-map",
  globe: "#/globe",
  systems: "#/systems",
} satisfies Record<AppRoute, string>;

function getRouteFromHash(): AppRoute {
  if (typeof window === "undefined") {
    return "network-diagram";
  }

  if (window.location.hash === routeHash["node-map"]) {
    return "node-map";
  }

  if (window.location.hash === routeHash.globe) {
    return "globe";
  }

  if (window.location.hash === routeHash.systems) {
    return "systems";
  }

  return "network-diagram";
}

function entityOptions(viewMode: "governance" | "country" | "technical", entities: Entity[]) {
  if (viewMode === "technical") {
    return entities.filter((entity) => entity.kind === "system");
  }

  if (viewMode === "country") {
    return entities.filter((entity) => entity.kind === "country");
  }

  return entities;
}

export function App() {
  const [activeRoute, setActiveRoute] = useState<AppRoute>(() => getRouteFromHash());
  const graph = useGraphStore((state) => state.graph);
  const loading = useGraphStore((state) => state.loading);
  const error = useGraphStore((state) => state.error);
  const viewMode = useGraphStore((state) => state.viewMode);
  const layoutMode = useGraphStore((state) => state.layoutMode);
  const countryDisplayMode = useGraphStore((state) => state.countryDisplayMode);
  const focusEntityId = useGraphStore((state) => state.focusEntityId);
  const selectedEntityId = useGraphStore((state) => state.selectedEntityId);
  const setBootstrap = useGraphStore((state) => state.setBootstrap);
  const setError = useGraphStore((state) => state.setError);
  const setLoading = useGraphStore((state) => state.setLoading);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const setDisplayMode = useGraphStore((state) => state.setDisplayMode);
  const setLayoutMode = useGraphStore((state) => state.setLayoutMode);
  const setCountryDisplayMode = useGraphStore((state) => state.setCountryDisplayMode);
  const setFocusEntityId = useGraphStore((state) => state.setFocusEntityId);
  const resetSelection = useGraphStore((state) => state.resetSelection);

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

  useEffect(() => {
    function syncRoute() {
      setActiveRoute(getRouteFromHash());
    }

    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  useEffect(() => {
    if (activeRoute === "node-map") {
      setViewMode("governance");
      setDisplayMode("graph");
      setLayoutMode("cose");
      setCountryDisplayMode("node");
    } else if (activeRoute === "globe") {
      setViewMode("governance");
      setDisplayMode("globe");
      setCountryDisplayMode("node");
    } else {
      setViewMode("governance");
      setDisplayMode("graph");
      setLayoutMode("elk-mrtree");
      setCountryDisplayMode("engulf");
    }

    setFocusEntityId(null);
    resetSelection();
  }, [
    activeRoute,
    resetSelection,
    setCountryDisplayMode,
    setDisplayMode,
    setFocusEntityId,
    setLayoutMode,
    setViewMode,
  ]);

  const isSystemsRoute = activeRoute === "systems";
  const isGlobeRoute = activeRoute === "globe";
  const showGraphControls = !isSystemsRoute;

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
  const showEntityDetails =
    graph != null &&
    selectedEntityId != null &&
    graph.entityById[selectedEntityId] != null;

  function openRoute(event: MouseEvent<HTMLAnchorElement>, route: AppRoute) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    event.preventDefault();
    if (window.location.hash !== routeHash[route]) {
      window.location.hash = routeHash[route];
    }
    setActiveRoute(route);
  }

  if (loading) {
    return (
      <Flex className="app-shell" align="center" justify="center">
        <Spin size="large" tip="Loading graph data..." />
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
      <Header className="main-nav">
        <a
          className="main-nav-brand"
          href={routeHash["network-diagram"]}
          onClick={(event) => openRoute(event, "network-diagram")}
        >
          CHM Network Explorer
        </a>
        <nav className="main-nav-links" aria-label="Main">
          <a
            className="main-nav-link"
            href={routeHash["network-diagram"]}
            aria-current={activeRoute === "network-diagram" ? "page" : undefined}
            onClick={(event) => openRoute(event, "network-diagram")}
          >
            Network Diagram
          </a>
          <a
            className="main-nav-link"
            href={routeHash["node-map"]}
            aria-current={activeRoute === "node-map" ? "page" : undefined}
            onClick={(event) => openRoute(event, "node-map")}
          >
            Node Map
          </a>
          <a
            className="main-nav-link"
            href={routeHash.globe}
            aria-current={activeRoute === "globe" ? "page" : undefined}
            onClick={(event) => openRoute(event, "globe")}
          >
            Globe
          </a>
          <a
            className="main-nav-link"
            href={routeHash.systems}
            aria-current={activeRoute === "systems" ? "page" : undefined}
            onClick={(event) => openRoute(event, "systems")}
          >
            Systems
          </a>
        </nav>
      </Header>
      <Layout className="app-body">
        {showGraphControls ? (
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
                  {!isGlobeRoute ? (
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
                  ) : null}
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
              <SavedViewsPanel readOnly={isPublicApp} />
            </Flex>
          </Sider>
        ) : null}
        <Content className={isSystemsRoute ? "directory-panel" : "graph-panel"}>
          {isSystemsRoute ? (
            <div className="systems-surface">
              <SystemDirectoryView />
            </div>
          ) : isGlobeRoute ? (
            <div className="graph-surface graph-surface-globe">
              <GlobeCanvas />
            </div>
          ) : (
            <div
              className={
                activeRoute === "node-map"
                  ? "graph-surface graph-surface-node-map"
                  : "graph-surface"
              }
            >
              <GraphCanvas
                displayMode={activeRoute === "node-map" ? "node-map" : "diagram"}
              />
            </div>
          )}
        </Content>
        {showEntityDetails ? (
          <Sider width={380} className="right-rail" theme="light">
            <div className="right-rail-stack">
              <EntityDetailsPanel />
            </div>
          </Sider>
        ) : null}
      </Layout>
    </Layout>
  );
}
