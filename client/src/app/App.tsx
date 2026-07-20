import type { MouseEvent } from "react";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  Alert,
  Flex,
  Layout,
  Segmented,
  Spin,
  Typography,
} from "antd";

import { fetchBootstrap } from "./api";
import { EntityDetailsPanel } from "./components/EntityDetailsPanel";
import { SystemDirectoryView } from "./components/SystemDirectoryView";
import type { NodeMap3dArrangement } from "./graph/nodeMap3dLayout";
import { useGraphStore } from "./state/graphStore";

const { Content, Header, Sider } = Layout;
const { Text } = Typography;
const ForceGraphCanvas = lazy(() =>
  import("./components/ForceGraphCanvas").then((module) => ({
    default: module.ForceGraphCanvas,
  })),
);

type AppRoute = "ryu" | "systems";

const routeHash = {
  ryu: "#/ryu",
  systems: "#/systems",
} satisfies Record<AppRoute, string>;

function getRouteFromHash(): AppRoute {
  if (typeof window === "undefined") {
    return "ryu";
  }

  if (window.location.hash === routeHash.ryu || window.location.hash === "#/node-map-3d") {
    return "ryu";
  }

  if (window.location.hash === routeHash.systems) {
    return "systems";
  }

  return "ryu";
}

export function App() {
  const [activeRoute, setActiveRoute] = useState<AppRoute>(() => getRouteFromHash());
  const [nodeMap3dArrangement, setNodeMap3dArrangement] =
    useState<NodeMap3dArrangement>("current");
  const graph = useGraphStore((state) => state.graph);
  const loading = useGraphStore((state) => state.loading);
  const error = useGraphStore((state) => state.error);
  const selectedEntityId = useGraphStore((state) => state.selectedEntityId);
  const setBootstrap = useGraphStore((state) => state.setBootstrap);
  const setError = useGraphStore((state) => state.setError);
  const setLoading = useGraphStore((state) => state.setLoading);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const setDisplayMode = useGraphStore((state) => state.setDisplayMode);
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
    if (activeRoute === "ryu") {
      setViewMode("governance");
      setDisplayMode("graph");
      setCountryDisplayMode("node");
    }

    setFocusEntityId(null);
    resetSelection();
  }, [
    activeRoute,
    resetSelection,
    setCountryDisplayMode,
    setDisplayMode,
    setFocusEntityId,
    setViewMode,
  ]);

  const isSystemsRoute = activeRoute === "systems";
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
          href={routeHash.ryu}
          onClick={(event) => openRoute(event, "ryu")}
        >
          CHM Network Explorer
        </a>
        <nav className="main-nav-links" aria-label="Main">
          <a
            className="main-nav-link"
            href={routeHash.ryu}
            aria-current={activeRoute === "ryu" ? "page" : undefined}
            onClick={(event) => openRoute(event, "ryu")}
          >
            Ryu
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
        {!isSystemsRoute ? (
          <Sider width={420} className="left-rail" theme="light">
            <Flex vertical gap={12} className="left-rail-stack">
              <div className="left-rail-control">
                <Text type="secondary">3D Arrangement</Text>
                <Segmented
                  block
                  value={nodeMap3dArrangement}
                  options={[
                    { label: "Current", value: "current" },
                    { label: "Flat", value: "flat" },
                    { label: "Globe", value: "globe" },
                  ]}
                  onChange={(value) =>
                    setNodeMap3dArrangement(value as NodeMap3dArrangement)
                  }
                />
              </div>
            </Flex>
          </Sider>
        ) : null}
        <Content className={isSystemsRoute ? "directory-panel" : "graph-panel"}>
          {isSystemsRoute ? (
            <div className="systems-surface">
              <SystemDirectoryView />
            </div>
          ) : (
            <div className="graph-surface graph-surface-node-map graph-surface-node-map-3d">
              <Suspense
                fallback={
                  <Flex className="graph-canvas" align="center" justify="center">
                    <Spin size="large" tip="Loading 3D view..." />
                  </Flex>
                }
              >
                <ForceGraphCanvas arrangement={nodeMap3dArrangement} />
              </Suspense>
            </div>
          )}
        </Content>
        {showEntityDetails ? (
          <Sider
            width={380}
            className={isSystemsRoute ? "right-rail" : "right-rail right-rail-node-map-3d"}
            theme="light"
          >
            <div className="right-rail-stack">
              <EntityDetailsPanel />
            </div>
          </Sider>
        ) : null}
      </Layout>
    </Layout>
  );
}
