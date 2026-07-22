import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  ReactNode,
} from "react";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowsAltOutlined,
  CloseOutlined,
  DeploymentUnitOutlined,
  GlobalOutlined,
  PartitionOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Flex,
  Layout,
  Spin,
} from "antd";

import { fetchBootstrap } from "./api";
import { EntityDetailsPanel } from "./components/EntityDetailsPanel";
import { SystemDirectoryView } from "./components/SystemDirectoryView";
import type { NodeMap3dArrangement } from "./graph/nodeMap3dLayout";
import { useGraphStore } from "./state/graphStore";

const ForceGraphCanvas = lazy(() =>
  import("./components/ForceGraphCanvas").then((module) => ({
    default: module.ForceGraphCanvas,
  })),
);

type PaneId = "search" | "graph" | "details";
type CollapsiblePaneId = Exclude<PaneId, "details">;
type ResizablePaneId = Extract<PaneId, "search" | "details">;
type PaneOpenState = Record<CollapsiblePaneId, boolean>;
type PaneWidthState = Record<ResizablePaneId, number>;

const paneOrder: PaneId[] = ["search", "graph", "details"];
const resizablePaneIds = new Set<PaneId>(["search", "details"]);
const paneSize = {
  search: { defaultWidth: 420, minWidth: 320, maxWidth: 920 },
  details: { defaultWidth: 380, minWidth: 320, maxWidth: 560 },
} satisfies Record<ResizablePaneId, {
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}>;
const graphMinWidth = 188;

const nodeMap3dArrangementOptions: Array<{
  icon: ReactNode;
  label: string;
  value: NodeMap3dArrangement;
}> = [
  { icon: <DeploymentUnitOutlined />, label: "Graph", value: "current" },
  { icon: <PartitionOutlined />, label: "Tree", value: "flat" },
  { icon: <GlobalOutlined />, label: "Globe", value: "globe" },
];

const paneLabels: Record<PaneId, string> = {
  search: "Search",
  graph: "Graph",
  details: "Details",
};

function clampPaneWidth(paneId: ResizablePaneId, width: number): number {
  const size = paneSize[paneId];
  return Math.min(size.maxWidth, Math.max(size.minWidth, width));
}

export function App() {
  const [nodeMap3dArrangement, setNodeMap3dArrangement] =
    useState<NodeMap3dArrangement>("current");
  const [openPanes, setOpenPanes] = useState<PaneOpenState>({
    search: true,
    graph: true,
  });
  const [paneWidths, setPaneWidths] = useState<PaneWidthState>({
    search: paneSize.search.defaultWidth,
    details: paneSize.details.defaultWidth,
  });
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
    setViewMode("governance");
    setDisplayMode("graph");
    setCountryDisplayMode("node");
    setFocusEntityId(null);
    resetSelection();
  }, [
    resetSelection,
    setCountryDisplayMode,
    setDisplayMode,
    setFocusEntityId,
    setViewMode,
  ]);

  const showEntityDetails =
    graph != null &&
    selectedEntityId != null &&
    graph.entityById[selectedEntityId] != null;
  const openPaneCount = paneOrder.filter((paneId) => isPaneOpen(paneId)).length;

  function isPaneOpen(paneId: PaneId): boolean {
    return paneId === "details" ? showEntityDetails : openPanes[paneId];
  }

  function setPaneOpen(paneId: CollapsiblePaneId, open: boolean) {
    setOpenPanes((current) => ({ ...current, [paneId]: open }));
  }

  function adjacentCollapsiblePane(paneId: PaneId): CollapsiblePaneId {
    const paneIndex = paneOrder.indexOf(paneId);
    const adjacentPanes = [paneOrder[paneIndex + 1], paneOrder[paneIndex - 1]];
    return (
      adjacentPanes.find(
        (adjacentPane): adjacentPane is CollapsiblePaneId =>
          adjacentPane === "search" || adjacentPane === "graph",
      ) ?? "graph"
    );
  }

  function closePane(paneId: PaneId) {
    const shouldOpenAdjacentPane = openPaneCount <= 1;
    const adjacentPane = adjacentCollapsiblePane(paneId);

    if (paneId === "details") {
      if (shouldOpenAdjacentPane) {
        setPaneOpen(adjacentPane, true);
      }
      resetSelection();
      return;
    }

    setOpenPanes((current) => ({
      ...current,
      [paneId]: false,
      ...(shouldOpenAdjacentPane ? { [adjacentPane]: true } : {}),
    }));
  }

  function expandPane(paneId: PaneId) {
    setOpenPanes({
      search: paneId === "search",
      graph: paneId === "graph",
    });
    if (paneId !== "details") {
      resetSelection();
    }
  }

  function startPaneResize(
    paneId: ResizablePaneId,
    edge: "left" | "right",
    event: PointerEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = clampPaneWidth(
      paneId,
      event.currentTarget.parentElement?.getBoundingClientRect().width ??
        paneWidths[paneId],
    );
    setPaneWidths((current) => ({ ...current, [paneId]: startWidth }));

    function handlePointerMove(moveEvent: globalThis.PointerEvent) {
      const delta =
        edge === "right" ? moveEvent.clientX - startX : startX - moveEvent.clientX;
      setPaneWidths((current) => ({
        ...current,
        [paneId]: clampPaneWidth(paneId, startWidth + delta),
      }));
    }

    function stopResize() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
  }

  function resizePaneWithKeyboard(
    paneId: ResizablePaneId,
    edge: "left" | "right",
    event: KeyboardEvent<HTMLDivElement>,
  ) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const edgeMultiplier = edge === "right" ? 1 : -1;
    setPaneWidths((current) => ({
      ...current,
      [paneId]: clampPaneWidth(
        paneId,
        current[paneId] + direction * edgeMultiplier * 24,
      ),
    }));
  }

  function paneStyle(paneId: PaneId): CSSProperties {
    if (paneId === "graph") {
      return {
        flex: "1 1 420px",
        minWidth: graphMinWidth,
      };
    }

    if (shouldFillPane(paneId)) {
      return {
        flex: "1 1 0",
        minWidth: paneSize[paneId].minWidth,
      };
    }

    return {
      flex: `0 0 ${paneWidths[paneId]}px`,
      minWidth: paneSize[paneId].minWidth,
      maxWidth: paneSize[paneId].maxWidth,
    };
  }

  function shouldFillPane(paneId: PaneId): boolean {
    return openPaneCount === 1 || (!isPaneOpen("graph") && paneId !== "graph");
  }

  function renderPaneHeader(paneId: PaneId) {
    return (
      <div className="workspace-pane-header">
        <Flex align="center" gap={8} style={{ minWidth: 0 }}>
          {paneId === "graph" ? (
            renderGraphViewControls()
          ) : (
            <span className="workspace-pane-title">{paneLabels[paneId]}</span>
          )}
        </Flex>
        {renderPaneActions(paneId)}
      </div>
    );
  }

  function renderGraphViewControls(collapsed = false) {
    return (
      <div
        className={`graph-view-controls${collapsed ? " is-collapsed" : ""}`}
        role="group"
        aria-label="Graph view"
      >
        {nodeMap3dArrangementOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-label={
              collapsed
                ? `Open graph pane in ${option.label.toLowerCase()} view`
                : option.label
            }
            aria-pressed={nodeMap3dArrangement === option.value}
            className="graph-view-button"
            title={
              collapsed
                ? `Open graph pane in ${option.label.toLowerCase()} view`
                : option.label
            }
            onClick={() => {
              setNodeMap3dArrangement(option.value);
              if (collapsed) {
                setPaneOpen("graph", true);
              }
            }}
          >
            <span className="graph-view-icon" aria-hidden="true">
              {option.icon}
            </span>
          </button>
        ))}
      </div>
    );
  }

  function renderPaneActions(paneId: PaneId) {
    const canExpand = openPaneCount > 1;
    return (
      <div className="workspace-pane-actions">
        <Button
          aria-label={`Expand ${paneLabels[paneId].toLowerCase()} pane`}
          disabled={!canExpand}
          icon={<ArrowsAltOutlined />}
          size="small"
          title={canExpand ? "Expand pane" : "Pane is already expanded"}
          type="text"
          onClick={() => expandPane(paneId)}
        />
        <Button
          aria-label={`Close ${paneLabels[paneId].toLowerCase()} pane`}
          icon={<CloseOutlined />}
          size="small"
          title={paneId === "details" ? "Close details" : "Close pane"}
          type="text"
          onClick={() => closePane(paneId)}
        />
      </div>
    );
  }

  function renderPane(paneId: PaneId, children: ReactNode) {
    const isResizable = resizablePaneIds.has(paneId);
    const resizeEdge = paneId === "details" ? "left" : "right";

    return (
      <section
        key={paneId}
        className={`workspace-pane workspace-pane-${paneId}${
          shouldFillPane(paneId) ? " is-fill" : ""
        }`}
        style={paneStyle(paneId)}
      >
        {paneId === "details" ? null : renderPaneHeader(paneId)}
        <div className="workspace-pane-body">{children}</div>
        {isResizable ? (
          <div
            aria-label={`Resize ${paneLabels[paneId].toLowerCase()} pane`}
            aria-orientation="vertical"
            aria-valuemax={paneSize[paneId as ResizablePaneId].maxWidth}
            aria-valuemin={paneSize[paneId as ResizablePaneId].minWidth}
            aria-valuenow={paneWidths[paneId as ResizablePaneId]}
            className={`workspace-pane-resizer is-${resizeEdge}`}
            role="separator"
            tabIndex={0}
            onKeyDown={(event) =>
              resizePaneWithKeyboard(
                paneId as ResizablePaneId,
                resizeEdge,
                event,
              )
            }
            onPointerDown={(event) =>
              startPaneResize(paneId as ResizablePaneId, resizeEdge, event)
            }
          />
        ) : null}
      </section>
    );
  }

  function renderCollapsedPane(paneId: CollapsiblePaneId) {
    if (paneId === "graph") {
      return (
        <div
          key={paneId}
          className="workspace-pane-collapsed workspace-pane-collapsed-graph"
        >
          {renderGraphViewControls(true)}
        </div>
      );
    }

    return (
      <button
        key={paneId}
        aria-label={`Open ${paneLabels[paneId].toLowerCase()} pane`}
        className={`workspace-pane-collapsed workspace-pane-collapsed-${paneId}`}
        title={`Open ${paneLabels[paneId]}`}
        type="button"
        onClick={() => setPaneOpen(paneId, true)}
      >
        <span className="workspace-pane-collapsed-title">{paneLabels[paneId]}</span>
      </button>
    );
  }

  function renderPaneSlot(paneId: CollapsiblePaneId, children: ReactNode) {
    return openPanes[paneId] ? renderPane(paneId, children) : renderCollapsedPane(paneId);
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
      <div className="app-body ryu-workspace">
        {renderPaneSlot(
          "search",
          <SystemDirectoryView
            variant="rail"
            showTitle={false}
          />,
        )}
        {renderPaneSlot(
          "graph",
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
        {showEntityDetails
          ? renderPane(
              "details",
              <EntityDetailsPanel
                extraActions={renderPaneActions("details")}
                showCloseButton={false}
                onClose={resetSelection}
              />,
            )
          : null}
      </div>
    </Layout>
  );
}
