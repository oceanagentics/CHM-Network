import { mesh } from "topojson-client";
import * as THREE from "three";
import countriesAtlas from "world-atlas/countries-110m.json";

import { nodeMap3dGlobeRadius } from "../graph/nodeMap3dLayout";

type LineGeometry = {
  coordinates: number[][] | number[][][];
  type: "LineString" | "MultiLineString";
};

type BoundaryLineState = {
  material: THREE.LineBasicMaterial;
  phase: number;
  speed: number;
  strength: number;
};

const boundaryMinOpacity = 0.05;
const boundaryMaxOpacity = 0.78;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomGridValue(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function toVector3(lat: number, lng: number, altitude = 0): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lng + 180);
  const radius = nodeMap3dGlobeRadius * (1 + altitude);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function lngLatToVector3(position: number[], altitude = 0): THREE.Vector3 {
  const [lng, lat] = position;
  return toVector3(lat, lng, altitude);
}

function makeLineFromPositions(
  coordinates: number[][],
  altitude: number,
): { line: THREE.Line; state: BoundaryLineState } | null {
  if (coordinates.length < 2) {
    return null;
  }

  const points = coordinates.map((position) => lngLatToVector3(position, altitude));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const [centerLng, centerLat] = getCoordinateCenter(coordinates);
  const material = makeBoundaryMaterial();
  const phase =
    randomGridValue(centerLng * 0.41, centerLat * 0.73) * Math.PI * 2 +
    centerLng * 0.035 +
    centerLat * 0.052;
  const state = {
    material,
    phase,
    speed: 0.65 + randomGridValue(centerLat * 1.12, centerLng * 0.38) * 0.45,
    strength: 0.68 + randomGridValue(centerLng * 0.22, centerLat * 1.48) * 0.32,
  };
  const line = new THREE.Line(geometry, material);
  line.renderOrder = -1;

  return { line, state };
}

function addLineGeometry(
  group: THREE.Group,
  geometry: LineGeometry,
  states: BoundaryLineState[],
  altitude: number,
): void {
  const lines =
    geometry.type === "LineString"
      ? [geometry.coordinates as number[][]]
      : (geometry.coordinates as number[][][]);

  for (const coordinates of lines) {
    const boundaryLine = makeLineFromPositions(coordinates, altitude);
    if (boundaryLine) {
      states.push(boundaryLine.state);
      group.add(boundaryLine.line);
    }
  }
}

function getCoordinateCenter(coordinates: number[][]): [number, number] {
  let lngTotal = 0;
  let latTotal = 0;
  for (const [lng, lat] of coordinates) {
    lngTotal += lng;
    latTotal += lat;
  }

  return [lngTotal / coordinates.length, latTotal / coordinates.length];
}

function makeBoundaryMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: "#f2d273",
    depthWrite: false,
    opacity: 0,
    transparent: true,
  });
}

function makePoliticalBorders(): THREE.Group {
  const group = new THREE.Group();
  const topology = countriesAtlas as {
    objects: { countries: unknown };
  };
  const borders = mesh(
    countriesAtlas as never,
    topology.objects.countries as never,
  ) as LineGeometry;
  const states: BoundaryLineState[] = [];

  addLineGeometry(group, borders, states, 0.006);
  group.userData.nodeMap3dBoundaryStates = states;
  return group;
}

export function createNodeMap3dGlobe(): THREE.Group {
  const group = new THREE.Group();
  group.name = "node-map-3d-globe";

  const borders = makePoliticalBorders();
  borders.renderOrder = -1;
  group.userData.nodeMap3dBoundaryStates =
    borders.userData.nodeMap3dBoundaryStates;
  group.add(borders);

  return group;
}

export function updateNodeMap3dGlobe(
  object: THREE.Object3D,
  elapsedSeconds: number,
  visibility = 1,
): void {
  const states = object.userData.nodeMap3dBoundaryStates as
    | BoundaryLineState[]
    | undefined;
  if (!states) {
    return;
  }

  for (const state of states) {
    const pulse =
      0.5 + Math.sin(elapsedSeconds * state.speed + state.phase) * 0.5;
    const alpha =
      boundaryMinOpacity +
      (boundaryMaxOpacity - boundaryMinOpacity) * pulse ** 1.7;
    const opacity = clamp(
      alpha * state.strength,
      boundaryMinOpacity,
      boundaryMaxOpacity,
    );
    state.material.opacity = clamp(opacity * visibility, 0, boundaryMaxOpacity);
  }
}

function disposeMaterial(material: THREE.Material): void {
  const mappedMaterial = material as THREE.Material & {
    alphaMap?: THREE.Texture | null;
    map?: THREE.Texture | null;
  };
  mappedMaterial.map?.dispose();
  mappedMaterial.alphaMap?.dispose();
  material.dispose();
}

export function disposeNodeMap3dObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh | THREE.Line;
    const geometry = "geometry" in mesh ? mesh.geometry : undefined;
    const material = "material" in mesh ? mesh.material : undefined;
    geometry?.dispose();
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
    } else {
      if (material) {
        disposeMaterial(material);
      }
    }
  });
}
