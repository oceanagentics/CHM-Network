import type {
  Entity,
  EntityInput,
  GraphBootstrapPayload,
  Relationship,
  RelationshipInput,
  SavedView,
  SavedViewInput,
  Source,
  SourceInput,
} from "../../../shared/domain";

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
  return request<GraphBootstrapPayload>("/api/graph/bootstrap");
}

export function fetchSavedViews(): Promise<SavedView[]> {
  return request<SavedView[]>("/api/saved-views");
}

export function createSavedView(input: SavedViewInput): Promise<SavedView> {
  return request<SavedView>("/api/saved-views", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSavedView(
  id: string,
  input: SavedViewInput,
): Promise<SavedView> {
  return request<SavedView>(`/api/saved-views/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteSavedView(id: string): Promise<void> {
  return request<void>(`/api/saved-views/${id}`, {
    method: "DELETE",
  });
}

export function createEntity(input: EntityInput): Promise<Entity> {
  return request<Entity>("/api/entities", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEntity(id: string, input: EntityInput): Promise<Entity> {
  return request<Entity>(`/api/entities/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteEntity(id: string): Promise<void> {
  return request<void>(`/api/entities/${id}`, {
    method: "DELETE",
  });
}

export function createRelationship(input: RelationshipInput): Promise<Relationship> {
  return request<Relationship>("/api/relationships", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateRelationship(
  id: string,
  input: RelationshipInput,
): Promise<Relationship> {
  return request<Relationship>(`/api/relationships/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteRelationship(id: string): Promise<void> {
  return request<void>(`/api/relationships/${id}`, {
    method: "DELETE",
  });
}

export function createSource(input: SourceInput): Promise<Source> {
  return request<Source>("/api/sources", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSource(id: string, input: SourceInput): Promise<Source> {
  return request<Source>(`/api/sources/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteSource(id: string): Promise<void> {
  return request<void>(`/api/sources/${id}`, {
    method: "DELETE",
  });
}
