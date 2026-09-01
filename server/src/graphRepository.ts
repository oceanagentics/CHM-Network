import type {
  GraphBootstrapPayload,
  GraphNode,
  NodeLocalizationReviewInput,
  RyuSystemQuery,
  RyuSystemRecord,
  SavedView,
  Source,
  SupportedLocale,
} from "../../shared/domain";

export type RepositoryResult<T> = T | Promise<T>;

export interface GraphRepository {
  getBootstrap(): RepositoryResult<GraphBootstrapPayload>;
  listPortalSystems(query?: RyuSystemQuery): RepositoryResult<RyuSystemRecord[]>;
  searchPortalSystems(query?: RyuSystemQuery): RepositoryResult<RyuSystemRecord[]>;
  getPortalSystem(id: string, query?: RyuSystemQuery): RepositoryResult<RyuSystemRecord>;
  updateNodeLocalizationReview(
    id: string,
    locale: SupportedLocale,
    input: NodeLocalizationReviewInput,
    reviewer: string,
  ): RepositoryResult<GraphNode>;
  getSource(id: string): RepositoryResult<Source>;
  listSavedViews(): RepositoryResult<SavedView[]>;
  close?(): RepositoryResult<void>;
}
