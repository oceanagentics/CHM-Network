import type {
  GraphBootstrapPayload,
  GraphNode,
  NodeLocalizationReviewInput,
  SupportedLocale,
} from "../../../shared/domain";
import type {
  RecordAggregateContentInput,
  RecordDeleteImpact,
  RecordDetailDto,
  RecordListDto,
  RecordPatchInput,
  RecordReviewInput,
  RecordValidationResult,
} from "../../../shared/recordApi";
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

export function fetchRecords(params = new URLSearchParams()): Promise<RecordListDto> {
  const query = params.toString();
  return request<RecordListDto>(appPath(`/api/records${query ? `?${query}` : ""}`));
}

export function fetchRecord(
  id: string,
  params = new URLSearchParams(),
): Promise<RecordDetailDto> {
  const query = params.toString();
  return request<RecordDetailDto>(
    appPath(`/api/records/${encodeURIComponent(id)}${query ? `?${query}` : ""}`),
  );
}

export function upsertRecord(
  id: string,
  input: RecordAggregateContentInput,
  options: { validateOnly?: boolean; recordUpdatedAt?: string; createOnly?: boolean } = {},
): Promise<RecordDetailDto | RecordValidationResult> {
  return request<RecordDetailDto | RecordValidationResult>(
    appPath(`/api/records/${encodeURIComponent(id)}${options.validateOnly ? "?validateOnly=true" : ""}`),
    {
      method: "PUT",
      headers: {
        ...(options.recordUpdatedAt ? { "x-ryu-record-updated-at": options.recordUpdatedAt } : {}),
        ...(options.createOnly ? { "x-ryu-create-only": "true" } : {}),
      },
      body: JSON.stringify(input),
    },
  );
}

export function patchRecord(
  id: string,
  input: RecordPatchInput,
  options: { validateOnly?: boolean; recordUpdatedAt?: string } = {},
): Promise<RecordDetailDto | RecordValidationResult> {
  return request<RecordDetailDto | RecordValidationResult>(
    appPath(`/api/records/${encodeURIComponent(id)}${options.validateOnly ? "?validateOnly=true" : ""}`),
    {
      method: "PATCH",
      headers: options.recordUpdatedAt
        ? { "x-ryu-record-updated-at": options.recordUpdatedAt }
        : undefined,
      body: JSON.stringify(input),
    },
  );
}

export function deleteRecord(
  id: string,
  options: { validateOnly?: boolean; impactHash?: string; recordUpdatedAt?: string } = {},
): Promise<RecordDeleteImpact> {
  const params = new URLSearchParams();
  if (options.validateOnly) {
    params.set("validateOnly", "true");
  }
  if (options.impactHash) {
    params.set("impactHash", options.impactHash);
  }

  return request<RecordDeleteImpact>(
    appPath(`/api/records/${encodeURIComponent(id)}${params.size > 0 ? `?${params}` : ""}`),
    {
      method: "DELETE",
      headers: options.recordUpdatedAt
        ? { "x-ryu-record-updated-at": options.recordUpdatedAt }
        : undefined,
    },
  );
}

export function updateRecordReview(
  id: string,
  input: RecordReviewInput,
  recordUpdatedAt?: string,
): Promise<RecordDetailDto> {
  return request<RecordDetailDto>(appPath(`/api/records/${encodeURIComponent(id)}/review`), {
    method: "PATCH",
    headers: recordUpdatedAt
      ? { "x-ryu-record-updated-at": recordUpdatedAt }
      : undefined,
    body: JSON.stringify({
      locale: input.locale,
      reviewState: input.reviewState,
      reviewerNote: input.reviewerNote,
    }),
  });
}

export function updateNodeLocalizationReview(
  id: string,
  locale: SupportedLocale,
  input: NodeLocalizationReviewInput,
): Promise<GraphNode> {
  return updateNodeLocalizationReviewDirect(id, locale, input);
}

async function updateNodeLocalizationReviewDirect(
  id: string,
  locale: SupportedLocale,
  input: NodeLocalizationReviewInput,
): Promise<GraphNode> {
  const params = new URLSearchParams({ include: "localizations,edges,routes" });
  const current = await fetchRecord(id, params);
  const updated = await updateRecordReview(id, { locale, ...input }, current.recordUpdatedAt);
  return recordDetailToGraphNode(updated);
}

function recordDetailToGraphNode(record: RecordDetailDto): GraphNode {
  return {
    id: record.id,
    kind: record.kind,
    countryCode: record.countryCode,
    subtype: record.subtype,
    url: record.url,
    recordDepth: record.recordDepth,
    properties: record.record.properties ?? {},
    createdAt: record.record.createdAt,
    updatedAt: record.record.updatedAt,
    localizations: (record.localizations as GraphNode["localizations"] | undefined) ?? {},
    availableLocales: record.availableLocales,
    requestedLocale: record.requestedLocale,
    displayLocale: record.displayLocale,
    isLocaleFallback: record.isLocaleFallback,
  };
}
