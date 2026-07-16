/**
 * Cytoscape stylesheet contains visual presentation only; geometry comes from node data.
 */
import type cytoscape from "cytoscape";

const labelFontScale = 2;

export type GraphDisplayMode = "diagram" | "node-map";

const diagramStyles: cytoscape.StylesheetJson = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "text-wrap": "wrap",
      "text-max-width": "data(textMaxWidth)",
      "font-size": 15 * labelFontScale,
      "font-family": "Helvetica, Arial, sans-serif",
      color: "#132033",
      "text-valign": "center",
      "text-halign": "center",
      "background-color": "#d6e4f7",
      "border-width": 2,
      "border-color": "#42658f",
      width: "data(width)",
      height: "data(height)",
      padding: `${10 * labelFontScale}px`,
      "overlay-opacity": 0,
    },
  },
  { selector: 'node[kind = "country"]', style: { shape: "round-rectangle", "background-color": "#f7d470", "border-color": "#b28a23" } },
  {
    selector: 'node[kind = "country"]:parent',
    style: {
      "background-opacity": 0.08,
      "border-style": "dashed",
      "text-valign": "top",
      "text-halign": "center",
      "padding-top": `${28 * labelFontScale}px`,
      "padding-left": `${20 * labelFontScale}px`,
      "padding-right": `${20 * labelFontScale}px`,
      "padding-bottom": `${20 * labelFontScale}px`,
    },
  },
  { selector: 'node[kind = "organization"]', style: { shape: "round-rectangle", "background-color": "#dcefdc", "border-color": "#5d8b5d" } },
  { selector: 'node[kind = "system"]', style: { shape: "round-rectangle", "background-color": "#d9ebff", "border-color": "#467ab3" } },
  {
    selector: 'node[kind = "system"]:parent',
    style: {
      "background-opacity": 0.16,
      "text-valign": "top",
      "text-halign": "center",
      "padding-top": `${28 * labelFontScale}px`,
      "padding-left": `${20 * labelFontScale}px`,
      "padding-right": `${20 * labelFontScale}px`,
      "padding-bottom": `${20 * labelFontScale}px`,
    },
  },
  {
    selector: "edge",
    style: {
      width: 2.2,
      "line-color": "#73849b",
      "target-arrow-color": "#73849b",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "data(label)",
      "font-size": 10 * labelFontScale,
      "text-background-color": "#ffffff",
      "text-background-opacity": 0.8,
      "text-background-padding": "2px",
      "text-rotation": "autorotate",
      color: "#2a3950",
    },
  },
  { selector: 'edge[type = "governs"]', style: { "line-color": "#b28a23", "target-arrow-color": "#b28a23" } },
  { selector: 'edge[type = "hierarchy"]', style: { "line-color": "#7d8797", "target-arrow-color": "#7d8797", "line-style": "dashed", width: 1.8 } },
  { selector: 'edge[type = "operates"]', style: { "line-color": "#3f8d72", "target-arrow-color": "#3f8d72" } },
  { selector: 'edge[type = "part_of"]', style: { "line-color": "#7d8797", "target-arrow-color": "#7d8797", "line-style": "dashed", width: 1.8 } },
  { selector: 'edge[type = "publishes_to"]', style: { "line-color": "#2d6cc9", "target-arrow-color": "#2d6cc9", width: 3 } },
  { selector: 'edge[type = "syncs_to"]', style: { "line-color": "#8a59b7", "target-arrow-color": "#8a59b7", width: 3 } },
  { selector: '[status = "planned"]', style: { "border-style": "dashed", "line-style": "dashed" } },
  { selector: '[status = "speculative"]', style: { "border-style": "dotted", "line-style": "dotted", opacity: 0.7 } },
  {
    selector: ".is-focus",
    style: {
      "border-width": 4,
      "border-color": "#ff7f50",
      "z-index-compare": "manual",
      "z-index": 999,
    },
  },
  {
    selector: ".is-selected",
    style: {
      "underlay-color": "#ff7f50",
      "underlay-opacity": 1,
      "underlay-padding": 8,
    },
  },
  {
    selector: ".is-neighbor",
    style: {
      "underlay-color": "#ff7f50",
      "underlay-opacity": 1,
      "underlay-padding": 6,
      "z-index-compare": "manual",
      "z-index": 998,
    },
  },
  {
    selector: ".is-connected",
    style: {
      "line-color": "#ff7f50",
      "target-arrow-color": "#ff7f50",
      width: 4.4,
      "z-index-compare": "manual",
      "z-index": 997,
    },
  },
];

const nodeMapStyles: cytoscape.StylesheetJson = [
  {
    selector: "node",
    style: {
      label: "data(simpleLabel)",
      "font-size": 10,
      "font-family": "Helvetica, Arial, sans-serif",
      color: "#dfeeff",
      "text-valign": "center",
      "text-halign": "right",
      "text-margin-x": 8,
      "text-wrap": "none",
      "text-outline-width": 1,
      "text-outline-color": "#31598d",
      "background-color": "#f6fbff",
      "border-width": 0,
      shape: "ellipse",
      width: 7,
      height: 7,
      "overlay-opacity": 0,
    },
  },
  { selector: 'node[kind = "country"]', style: { width: 10, height: 10 } },
  { selector: 'node[kind = "organization"]', style: { width: 8, height: 8 } },
  { selector: 'node[kind = "system"]', style: { width: 6, height: 6 } },
  {
    selector: "edge",
    style: {
      width: 0.8,
      "line-color": "#a9c9ee",
      "line-opacity": 0.34,
      "target-arrow-shape": "none",
      "curve-style": "bezier",
      label: "",
      "overlay-opacity": 0,
    },
  },
  { selector: 'edge[type = "governs"]', style: { "line-color": "#c8dfff", "line-opacity": 0.28 } },
  { selector: 'edge[type = "hierarchy"]', style: { "line-color": "#8fb3db", "line-style": "dotted", "line-opacity": 0.22 } },
  { selector: 'edge[type = "operates"]', style: { "line-color": "#9fe3d0", "line-opacity": 0.32 } },
  { selector: 'edge[type = "part_of"]', style: { "line-color": "#8fb3db", "line-style": "dotted", "line-opacity": 0.28 } },
  { selector: 'edge[type = "publishes_to"]', style: { "line-color": "#ff5f6d", "line-opacity": 0.62, width: 1.2 } },
  { selector: 'edge[type = "syncs_to"]', style: { "line-color": "#c99cff", "line-opacity": 0.56, width: 1.2 } },
  { selector: '[status = "planned"]', style: { "line-style": "dashed" } },
  { selector: '[status = "speculative"]', style: { "line-style": "dotted", opacity: 0.72 } },
  {
    selector: ".is-focus",
    style: {
      "background-color": "#ffffff",
      "border-width": 2,
      "border-color": "#ff785e",
      width: 12,
      height: 12,
      "z-index-compare": "manual",
      "z-index": 999,
    },
  },
  {
    selector: ".is-selected",
    style: {
      "underlay-color": "#ff785e",
      "underlay-opacity": 1,
      "underlay-padding": 5,
    },
  },
  {
    selector: ".is-neighbor",
    style: {
      "underlay-color": "#ffbf66",
      "underlay-opacity": 0.82,
      "underlay-padding": 4,
      "z-index-compare": "manual",
      "z-index": 998,
    },
  },
  {
    selector: ".is-connected",
    style: {
      "line-color": "#ff785e",
      "line-opacity": 0.9,
      width: 2,
      "z-index-compare": "manual",
      "z-index": 997,
    },
  },
];

export function getCytoscapeStyles(
  displayMode: GraphDisplayMode,
): cytoscape.StylesheetJson {
  return displayMode === "node-map" ? nodeMapStyles : diagramStyles;
}

export const cytoscapeStyles = diagramStyles;
