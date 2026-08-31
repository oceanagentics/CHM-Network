import type {
  GraphBootstrapPayload,
  GraphNode,
  NodeReviewInput,
  RyuSystemQuery,
  RyuSystemRecord,
  SavedView,
  Source,
} from "../../shared/domain";

export type RepositoryResult<T> = T | Promise<T>;

export interface GraphRepository {
  getBootstrap(): RepositoryResult<GraphBootstrapPayload>;
  listPortalSystems(query?: RyuSystemQuery): RepositoryResult<RyuSystemRecord[]>;
  searchPortalSystems(query?: RyuSystemQuery): RepositoryResult<RyuSystemRecord[]>;
  getPortalSystem(id: string, query?: RyuSystemQuery): RepositoryResult<RyuSystemRecord>;
  updateNodeReview(id: string, input: NodeReviewInput, reviewer: string): RepositoryResult<GraphNode>;
  getSource(id: string): RepositoryResult<Source>;
  listSavedViews(): RepositoryResult<SavedView[]>;
  close?(): RepositoryResult<void>;
}
