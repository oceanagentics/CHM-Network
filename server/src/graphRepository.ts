import type {
  GraphBootstrapPayload,
  GraphEdge,
  GraphEdgeInput,
  GraphNode,
  GraphNodeInput,
  RyuSystemQuery,
  RyuSystemRecord,
  SavedView,
  SavedViewInput,
  Source,
  SourceInput,
} from "../../shared/domain";

export type RepositoryResult<T> = T | Promise<T>;

export interface GraphRepository {
  getBootstrap(): RepositoryResult<GraphBootstrapPayload>;
  listPortalSystems(query?: RyuSystemQuery): RepositoryResult<RyuSystemRecord[]>;
  searchPortalSystems(query?: RyuSystemQuery): RepositoryResult<RyuSystemRecord[]>;
  getPortalSystem(id: string, query?: RyuSystemQuery): RepositoryResult<RyuSystemRecord>;
  createNode(input: GraphNodeInput): RepositoryResult<GraphNode>;
  updateNode(id: string, input: GraphNodeInput): RepositoryResult<GraphNode>;
  deleteNode(id: string): RepositoryResult<void>;
  createEdge(input: GraphEdgeInput): RepositoryResult<GraphEdge>;
  updateEdge(id: string, input: GraphEdgeInput): RepositoryResult<GraphEdge>;
  deleteEdge(id: string): RepositoryResult<void>;
  getSource(id: string): RepositoryResult<Source>;
  createSource(input: SourceInput): RepositoryResult<Source>;
  updateSource(id: string, input: SourceInput): RepositoryResult<Source>;
  deleteSource(id: string): RepositoryResult<void>;
  listSavedViews(): RepositoryResult<SavedView[]>;
  createSavedView(input: SavedViewInput): RepositoryResult<SavedView>;
  updateSavedView(id: string, input: SavedViewInput): RepositoryResult<SavedView>;
  deleteSavedView(id: string): RepositoryResult<void>;
  close?(): RepositoryResult<void>;
}
