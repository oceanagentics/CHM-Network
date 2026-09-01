import { useEffect, useMemo, useRef, useState } from "react";
import { feature, mesh } from "topojson-client";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import countriesAtlas from "world-atlas/countries-110m.json";

import { projectGlobeGraph, type GlobeNode } from "../graph/globeProjection";
import { projectGraph } from "../graph/projection";
import { useGraphStore } from "../state/graphStore";

const globeRadius = 120;

type CameraViewState = {
  position: [number, number, number];
  target: [number, number, number];
};

const countryNumericIdByCode: Record<string, string> = {
  CAN: "124",
  DEU: "276",
  JPN: "392",
  USA: "840",
};

type LineGeometry = {
  coordinates: number[][] | number[][][];
  type: "LineString" | "MultiLineString";
};

type CountryFeature = {
  id?: string | number;
  geometry: {
    coordinates: number[][][] | number[][][][];
    type: "Polygon" | "MultiPolygon";
  };
};

function toVector3(lat: number, lng: number, altitude = 0): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lng + 180);
  const radius = globeRadius * (1 + altitude);

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

function makeLabelTexture(text: string, selected: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const width = 320;
  const height = 96;
  canvas.width = width;
  canvas.height = height;

  if (context) {
    context.clearRect(0, 0, width, height);
    context.font = `${selected ? 700 : 600} 24px Helvetica, Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#ffffff";
    context.strokeStyle = selected ? "#d92332" : "rgba(35, 52, 78, 0.34)";
    context.lineWidth = selected ? 4 : 2;
    context.beginPath();
    context.roundRect(12, 22, width - 24, 52, 8);
    context.fill();
    context.stroke();
    context.fillStyle = "#132033";
    context.fillText(text.length > 25 ? `${text.slice(0, 24)}...` : text, width / 2, height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function getLabelPosition(
  node: GlobeNode,
  nodes: GlobeNode[],
  selected: boolean,
): THREE.Vector3 {
  const base = toVector3(node.lat, node.lng, node.altitude + (selected ? 0.12 : 0.05));
  if (!selected) {
    return base;
  }

  const normal = base.clone().normalize();
  const avoidance = new THREE.Vector3();
  for (const other of nodes) {
    if (other.id === node.id || other.kind === "country") {
      continue;
    }

    const otherVector = toVector3(other.lat, other.lng, other.altitude).normalize();
    const closeness = normal.dot(otherVector);
    if (closeness < 0.94) {
      continue;
    }

    const tangentAway = normal
      .clone()
      .multiplyScalar(closeness)
      .sub(otherVector)
      .normalize();
    avoidance.addScaledVector(tangentAway, (closeness - 0.94) * 18);
  }

  if (avoidance.lengthSq() < 0.001) {
    avoidance.copy(new THREE.Vector3(-normal.z, 0, normal.x));
  }

  return base.add(avoidance.normalize().multiplyScalar(28));
}

function makeLabelSprite(node: GlobeNode, selected: boolean, nodes: GlobeNode[]): THREE.Sprite {
  const texture = makeLabelTexture(node.label, selected);
  const material = new THREE.SpriteMaterial({
    map: texture,
    opacity: 1,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.copy(getLabelPosition(node, nodes, selected));
  sprite.scale.set(selected ? 44 : 34, selected ? 13 : 10, 1);
  sprite.renderOrder = selected ? 5 : 2;
  return sprite;
}

function makeArc(
  source: GlobeNode,
  target: GlobeNode,
  color: string,
  dashed: boolean,
  highlighted = false,
): THREE.Line {
  const start = toVector3(source.lat, source.lng, source.altitude + 0.03);
  const end = toVector3(target.lat, target.lng, target.altitude + 0.03);
  const mid = start.clone().add(end).multiplyScalar(0.5).normalize();
  const distance = start.distanceTo(end);
  const lift = Math.max(0.32, Math.min(0.82, distance / 290));
  const control = mid.multiplyScalar(globeRadius * (1 + lift));
  const curve = new THREE.QuadraticBezierCurve3(start, control, end);
  const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(36));
  const material = dashed
    ? new THREE.LineDashedMaterial({
        color,
        transparent: true,
        opacity: highlighted ? 0.95 : 0.48,
        dashSize: 5,
        gapSize: 4,
      })
    : new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: highlighted ? 0.95 : 0.46,
      });
  const line = new THREE.Line(geometry, material);
  if (dashed) {
    line.computeLineDistances();
  }
  return line;
}

function makeArcGlow(source: GlobeNode, target: GlobeNode): THREE.Line {
  const glow = makeArc(source, target, "#d92332", false, true);
  const material = glow.material as THREE.LineBasicMaterial;
  material.opacity = 0.32;
  material.blending = THREE.AdditiveBlending;
  material.depthWrite = false;
  glow.renderOrder = 4;
  return glow;
}

function makeLineFromPositions(
  coordinates: number[][],
  material: THREE.LineBasicMaterial,
  altitude: number,
): THREE.Line | null {
  if (coordinates.length < 2) {
    return null;
  }

  const points = coordinates.map((position) => lngLatToVector3(position, altitude));
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

function addLineGeometry(
  group: THREE.Group,
  geometry: LineGeometry,
  material: THREE.LineBasicMaterial,
  altitude: number,
): void {
  const lines =
    geometry.type === "LineString"
      ? [geometry.coordinates as number[][]]
      : (geometry.coordinates as number[][][]);

  for (const lineCoordinates of lines) {
    const line = makeLineFromPositions(lineCoordinates, material, altitude);
    if (line) {
      group.add(line);
    }
  }
}

function makeWorldBoundaries(): THREE.Group {
  const group = new THREE.Group();
  const topology = countriesAtlas as {
    objects: { countries: unknown };
  };
  const borders = mesh(
    countriesAtlas as never,
    topology.objects.countries as never,
  ) as LineGeometry;
  const material = new THREE.LineBasicMaterial({
    color: "#f2c94c",
    transparent: true,
    opacity: 0.62,
  });

  addLineGeometry(group, borders, material, 0.009);
  return group;
}

function getIncludedCountryIds(countryCodes: Set<string>): Set<string> {
  return new Set(
    [...countryCodes]
      .map((countryCode) => countryNumericIdByCode[countryCode])
      .filter((countryId): countryId is string => Boolean(countryId)),
  );
}

function getCountryFeatures(): CountryFeature[] {
  const topology = countriesAtlas as {
    objects: { countries: unknown };
  };
  const collection = feature(
    countriesAtlas as never,
    topology.objects.countries as never,
  ) as unknown as { features: CountryFeature[] };

  return collection.features;
}

function makeIncludedCountryOutlines(countryCodes: Set<string>): THREE.Group {
  const group = new THREE.Group();
  const activeCountryIds = getIncludedCountryIds(countryCodes);
  const material = new THREE.LineBasicMaterial({
    color: "#f2c94c",
    transparent: true,
    opacity: 0.96,
  });

  for (const country of getCountryFeatures()) {
    if (!activeCountryIds.has(String(country.id))) {
      continue;
    }

    if (country.geometry.type === "Polygon") {
      for (const ring of country.geometry.coordinates as number[][][]) {
        const line = makeLineFromPositions(ring, material, 0.017);
        if (line) {
          group.add(line);
        }
      }
      continue;
    }

    for (const polygon of country.geometry.coordinates as number[][][][]) {
      for (const ring of polygon) {
        const line = makeLineFromPositions(ring, material, 0.017);
        if (line) {
          group.add(line);
        }
      }
    }
  }

  return group;
}

function mapX(lng: number, width: number): number {
  return ((lng + 180) / 360) * width;
}

function mapY(lat: number, height: number): number {
  return ((90 - lat) / 180) * height;
}

function drawRing(
  context: CanvasRenderingContext2D,
  ring: number[][],
  width: number,
  height: number,
): void {
  let started = false;
  let previousLng: number | null = null;

  for (const [lng, lat] of ring) {
    if (previousLng != null && Math.abs(lng - previousLng) > 180) {
      started = false;
    }

    const x = mapX(lng, width);
    const y = mapY(lat, height);
    if (!started) {
      context.moveTo(x, y);
      started = true;
    } else {
      context.lineTo(x, y);
    }
    previousLng = lng;
  }
}

function makeGlobeTexture(countryCodes: Set<string>): THREE.CanvasTexture {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = height;

  if (context) {
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#e3eef4");
    gradient.addColorStop(0.5, "#d8e7f0");
    gradient.addColorStop(1, "#c9dde9");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    const activeCountryIds = getIncludedCountryIds(countryCodes);
    context.fillStyle = "rgba(242, 201, 76, 0.62)";
    context.strokeStyle = "rgba(242, 201, 76, 0.82)";
    context.lineWidth = 1.4;

    for (const country of getCountryFeatures()) {
      if (!activeCountryIds.has(String(country.id))) {
        continue;
      }

      const polygons =
        country.geometry.type === "Polygon"
          ? [country.geometry.coordinates as number[][][]]
          : (country.geometry.coordinates as number[][][][]);

      for (const rings of polygons) {
        context.beginPath();
        for (const ring of rings) {
          drawRing(context, ring, width, height);
          context.closePath();
        }
        context.fill("evenodd");
        context.stroke();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function makeSelectedGlow(node: GlobeNode): THREE.Mesh {
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(node.radius * 3.2, 32, 24),
    new THREE.MeshBasicMaterial({
      color: "#d92332",
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.position.copy(toVector3(node.lat, node.lng, node.altitude));
  glow.renderOrder = 4;
  return glow;
}

function getHighlightState(
  nodes: GlobeNode[],
  links: ReturnType<typeof projectGlobeGraph>["links"],
  selectedEntityId: string | null,
  selectedRelationshipId: string | null,
) {
  const nodeIds = new Set<string>();
  const linkIds = new Set<string>();
  let primaryNodeId: string | null = null;
  let primaryLinkId: string | null = null;

  if (selectedEntityId) {
    primaryNodeId = selectedEntityId;
    nodeIds.add(selectedEntityId);
    for (const link of links) {
      if (link.source !== selectedEntityId && link.target !== selectedEntityId) {
        continue;
      }
      linkIds.add(link.id);
      nodeIds.add(link.source);
      nodeIds.add(link.target);
    }
  }

  if (selectedRelationshipId) {
    const selectedLink = links.find((link) => link.id === selectedRelationshipId);
    if (selectedLink) {
      primaryLinkId = selectedRelationshipId;
      linkIds.add(selectedLink.id);
      nodeIds.add(selectedLink.source);
      nodeIds.add(selectedLink.target);
    }
  }

  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  return {
    nodeIds: new Set([...nodeIds].filter((nodeId) => visibleNodeIds.has(nodeId))),
    linkIds,
    primaryLinkId,
    primaryNodeId,
  };
}

function makeGraticule(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: "#6f879f",
    transparent: true,
    opacity: 0.22,
  });

  for (let lat = -60; lat <= 60; lat += 30) {
    const points = [];
    for (let lng = -180; lng <= 180; lng += 4) {
      points.push(toVector3(lat, lng, 0.004));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  for (let lng = -180; lng < 180; lng += 30) {
    const points = [];
    for (let lat = -86; lat <= 86; lat += 4) {
      points.push(toVector3(lat, lng, 0.004));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  return group;
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh | THREE.Line | THREE.Sprite;
    const geometry = "geometry" in mesh ? mesh.geometry : undefined;
    const material = "material" in mesh ? mesh.material : undefined;
    geometry?.dispose();
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material?.dispose();
    }
  });
}

export function GlobeCanvas() {
  const graph = useGraphStore((state) => state.graph);
  const viewMode = useGraphStore((state) => state.viewMode);
  const countryDisplayMode = useGraphStore((state) => state.countryDisplayMode);
  const focusEntityId = useGraphStore((state) => state.focusEntityId);
  const locale = useGraphStore((state) => state.locale);
  const selectedEntityId = useGraphStore((state) => state.selectedEntityId);
  const selectedRelationshipId = useGraphStore((state) => state.selectedRelationshipId);
  const setSelectedEntityId = useGraphStore((state) => state.setSelectedEntityId);
  const setSelectedRelationshipId = useGraphStore((state) => state.setSelectedRelationshipId);
  const resetSelection = useGraphStore((state) => state.resetSelection);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const viewStateRef = useRef<CameraViewState | null>(null);

  const globeProjection = useMemo(() => {
    if (!graph) {
      return null;
    }

    const projection = projectGraph({
      graph,
      viewMode,
      countryDisplayMode,
      focusEntityId: viewMode === "governance" ? null : focusEntityId,
      locale,
    });

    return projectGlobeGraph(projection);
  }, [countryDisplayMode, focusEntityId, graph, locale, viewMode]);

  useEffect(() => {
    if (!container || !globeProjection) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#eef5fb");
    const camera = new THREE.PerspectiveCamera(
      42,
      Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
      0.1,
      1500,
    );
    if (viewStateRef.current) {
      camera.position.set(...viewStateRef.current.position);
    } else {
      camera.position.set(0, 120, 360);
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 210;
    controls.maxDistance = 560;
    if (viewStateRef.current) {
      controls.target.set(...viewStateRef.current.target);
      controls.update();
    }
    const highlight = getHighlightState(
      globeProjection.nodes,
      globeProjection.links,
      selectedEntityId,
      selectedRelationshipId,
    );
    controls.autoRotate = highlight.nodeIds.size === 0 && highlight.linkIds.size === 0;
    controls.autoRotateSpeed = 0.22;

    scene.add(new THREE.AmbientLight("#dcefff", 2.4));
    const keyLight = new THREE.DirectionalLight("#ffffff", 2.2);
    keyLight.position.set(240, 180, 160);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight("#8ec5ff", 1.2);
    fillLight.position.set(-220, -80, -160);
    scene.add(fillLight);

    const includedCountryCodes = new Set(
      globeProjection.nodes
        .filter((node) => node.kind === "country" && node.countryCode)
        .map((node) => node.countryCode as string),
    );
    const globeTexture = makeGlobeTexture(includedCountryCodes);
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(globeRadius, 96, 64),
      new THREE.MeshStandardMaterial({
        map: globeTexture,
        color: "#ffffff",
        emissive: "#173957",
        emissiveIntensity: 0.08,
        roughness: 0.78,
        metalness: 0.04,
      }),
    );
    scene.add(globe);
    scene.add(
      makeWorldBoundaries(),
    );
    scene.add(
      makeIncludedCountryOutlines(includedCountryCodes),
    );
    scene.add(makeGraticule());

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(globeRadius * 1.035, 96, 64),
      new THREE.MeshBasicMaterial({
        color: "#8fc7ff",
        transparent: true,
        opacity: 0.11,
        side: THREE.BackSide,
      }),
    );
    scene.add(atmosphere);

    const nodeById = Object.fromEntries(
      globeProjection.nodes.map((node) => [node.id, node]),
    );
    const interactiveNodes: THREE.Mesh[] = [];
    const interactiveLinks: THREE.Line[] = [];
    const pulsingObjects: THREE.Object3D[] = [];
    const pulsingLines: Array<{ line: THREE.Line; baseOpacity: number }> = [];

    for (const link of globeProjection.links) {
      const source = nodeById[link.source];
      const target = nodeById[link.target];
      if (!source || !target) {
        continue;
      }
      const isHighlighted = highlight.linkIds.has(link.id);
      const arc = makeArc(
        source,
        target,
        isHighlighted ? "#d92332" : link.color,
        false,
        isHighlighted,
      );
      arc.userData = { relationshipId: link.id };
      scene.add(arc);
      interactiveLinks.push(arc);
      if (isHighlighted) {
        const glow = makeArcGlow(source, target);
        scene.add(glow);
        pulsingLines.push(
          { line: arc, baseOpacity: 0.95 },
          { line: glow, baseOpacity: 0.32 },
        );
      }
    }

    for (const node of globeProjection.nodes) {
      const isHighlighted = highlight.nodeIds.has(node.id) || focusEntityId === node.id;
      const isPrimary = highlight.primaryNodeId === node.id;
      if (node.kind === "country") {
        if (isHighlighted) {
          scene.add(makeLabelSprite(node, true, globeProjection.nodes));
        }
        continue;
      }

      const point = new THREE.Mesh(
        new THREE.SphereGeometry(node.radius * (isPrimary ? 1.55 : isHighlighted ? 1.28 : 1), 24, 16),
        new THREE.MeshStandardMaterial({
          color: isHighlighted ? "#d92332" : node.color,
          emissive: isHighlighted ? "#ff7f50" : node.color,
          emissiveIntensity: isHighlighted ? 0.62 : 0.18,
          roughness: 0.42,
        }),
      );
      point.position.copy(toVector3(node.lat, node.lng, node.altitude));
      point.userData = { entityId: node.id };
      scene.add(point);
      interactiveNodes.push(point);
      if (isHighlighted) {
        const glow = makeSelectedGlow(node);
        scene.add(glow);
        pulsingObjects.push(point, glow);
      }

      const shouldLabel =
        isHighlighted ||
        node.altitude > 0.35 ||
        globeProjection.nodes.length < 40;
      if (shouldLabel) {
        scene.add(makeLabelSprite(node, isHighlighted, globeProjection.nodes));
      }
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownAt: { x: number; y: number } | null = null;

    const handlePointerDown = (event: PointerEvent) => {
      pointerDownAt = { x: event.clientX, y: event.clientY };
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (pointerDownAt) {
        const movement = Math.hypot(
          event.clientX - pointerDownAt.x,
          event.clientY - pointerDownAt.y,
        );
        pointerDownAt = null;
        if (movement > 5) {
          return;
        }
      }

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      raycaster.params.Line = { threshold: 4 };
      const [hit] = raycaster.intersectObjects(interactiveNodes, false);
      const entityId = hit?.object.userData.entityId as string | undefined;
      if (entityId) {
        setSelectedEntityId(entityId);
        return;
      }

      const [lineHit] = raycaster.intersectObjects(interactiveLinks, false);
      const relationshipId = lineHit?.object.userData.relationshipId as string | undefined;
      if (relationshipId) {
        setSelectedRelationshipId(relationshipId);
      } else {
        resetSelection();
      }
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);

    const resizeObserver = new ResizeObserver(() => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(container);

    let frame = 0;
    const animate = () => {
      const elapsed = performance.now() / 1000;
      const pulse = 1 + Math.sin(elapsed * 5.6) * 0.055;
      for (const object of pulsingObjects) {
        object.scale.setScalar(pulse);
      }
      const linePulse = 0.74 + Math.sin(elapsed * 4.4) * 0.16;
      for (const { line, baseOpacity } of pulsingLines) {
        const material = line.material as THREE.LineBasicMaterial | THREE.LineDashedMaterial;
        material.opacity = baseOpacity * linePulse;
      }
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      viewStateRef.current = {
        position: camera.position.toArray() as [number, number, number],
        target: controls.target.toArray() as [number, number, number],
      };
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      controls.dispose();
      disposeObject(scene);
      globeTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [
    container,
    focusEntityId,
    globeProjection,
    resetSelection,
    selectedEntityId,
    selectedRelationshipId,
    setSelectedEntityId,
    setSelectedRelationshipId,
  ]);

  return <div className="globe-canvas" ref={setContainer} />;
}
