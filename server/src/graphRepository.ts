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
import type {
  BulkRecordValidationInput,
  BulkRecordValidationResult,
  RecordAggregate,
  RecordAggregateContentInput,
  RecordDeleteImpact,
  RecordListResult,
  RecordMutationOptions,
  RecordPatchInput,
  RecordSearchQuery,
  RecordValidationResult,
} from "../../shared/recordApi";

export type RepositoryResult<T> = T | Promise<T>;

export interface GraphRepository {
  getBootstrap(): RepositoryResult<GraphBootstrapPayload>;
  listPortalSystems(query?: RyuSystemQuery): RepositoryResult<RyuSystemRecord[]>;
  searchPortalSystems(query?: RyuSystemQuery): RepositoryResult<RyuSystemRecord[]>;
  getPortalSystem(id: string, query?: RyuSystemQuery): RepositoryResult<RyuSystemRecord>;
  listRecords(query: RecordSearchQuery): RepositoryResult<RecordListResult>;
  getRecord(id: string, query: RecordSearchQuery): RepositoryResult<RecordAggregate>;
  validateRecordAggregate(
    id: string,
    input: RecordAggregateContentInput,
  ): RepositoryResult<RecordValidationResult>;
  upsertRecord(
    id: string,
    input: RecordAggregateContentInput,
    options?: RecordMutationOptions,
  ): RepositoryResult<RecordAggregate | RecordValidationResult>;
  patchRecord(
    id: string,
    input: RecordPatchInput,
    options?: RecordMutationOptions,
  ): RepositoryResult<RecordAggregate | RecordValidationResult>;
  getRecordDeleteImpact(id: string): RepositoryResult<RecordDeleteImpact>;
  deleteRecord(
    id: string,
    impactHash: string,
    options?: RecordMutationOptions,
  ): RepositoryResult<RecordDeleteImpact>;
  validateBulkRecords(input: BulkRecordValidationInput): RepositoryResult<BulkRecordValidationResult>;
  updateNodeLocalizationReview(
    id: string,
    locale: SupportedLocale,
    input: NodeLocalizationReviewInput,
    reviewer: string,
    options?: RecordMutationOptions,
  ): RepositoryResult<GraphNode>;
  getSource(id: string): RepositoryResult<Source>;
  listSavedViews(): RepositoryResult<SavedView[]>;
  close?(): RepositoryResult<void>;
}
