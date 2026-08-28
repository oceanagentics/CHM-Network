import type {
  GraphEdge,
  GraphEdgeInput,
  GraphBootstrapPayload,
  GraphNode,
  GraphNodeInput,
  SavedView,
  SavedViewInput,
  Source,
  SourceInput,
} from "../../../shared/domain";
import { appPath, bootstrapPath } from "./config";

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(errorBody?.error ?? `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function fetchBootstrap(): Promise<GraphBootstrapPayload> {
  return request<GraphBootstrapPayload>(bootstrapPath);
}

export function fetchSavedViews(): Promise<SavedView[]> {
  return request<SavedView[]>(appPath("/api/saved-views"));
}

export function createSavedView(input: SavedViewInput): Promise<SavedView> {
  return request<SavedView>(appPath("/api/saved-views"), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSavedView(
  id: string,
  input: SavedViewInput,
): Promise<SavedView> {
  return request<SavedView>(appPath(`/api/saved-views/${id}`), {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteSavedView(id: string): Promise<void> {
  return request<void>(appPath(`/api/saved-views/${id}`), {
    method: "DELETE",
  });
}

export function createNode(input: GraphNodeInput): Promise<GraphNode> {
  return request<GraphNode>(appPath("/api/nodes"), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateNode(id: string, input: GraphNodeInput): Promise<GraphNode> {
  return request<GraphNode>(appPath(`/api/nodes/${id}`), {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteNode(id: string): Promise<void> {
  return request<void>(appPath(`/api/nodes/${id}`), {
    method: "DELETE",
  });
}

export function createEdge(input: GraphEdgeInput): Promise<GraphEdge> {
  return request<GraphEdge>(appPath("/api/edges"), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEdge(
  id: string,
  input: GraphEdgeInput,
): Promise<GraphEdge> {
  return request<GraphEdge>(appPath(`/api/edges/${id}`), {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteEdge(id: string): Promise<void> {
  return request<void>(appPath(`/api/edges/${id}`), {
    method: "DELETE",
  });
}

export function createSource(input: SourceInput): Promise<Source> {
  return request<Source>(appPath("/api/sources"), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSource(id: string, input: SourceInput): Promise<Source> {
  return request<Source>(appPath(`/api/sources/${id}`), {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteSource(id: string): Promise<void> {
  return request<void>(appPath(`/api/sources/${id}`), {
    method: "DELETE",
  });
}
