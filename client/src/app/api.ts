import type {
  GraphBootstrapPayload,
  GraphNode,
  NodeLocalizationReviewInput,
  SavedView,
  SavedViewInput,
  SupportedLocale,
} from "../../../shared/domain";
import type {
  BulkRecordValidationInput,
  BulkRecordValidationResult,
  RecordAggregateContentInput,
  RecordDeleteImpact,
  RecordDetailDto,
  RecordListDto,
  RecordPatchInput,
  RecordReviewInput,
  RecordValidationResult,
} from "../../../shared/recordApi";
import { appPath, bootstrapPath, reviewApiPath } from "./config";
import { supportedLocales } from "../../../shared/localization";

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
  validateOnly = false,
): Promise<RecordDetailDto | RecordValidationResult> {
  return request<RecordDetailDto | RecordValidationResult>(
    reviewApiPath(`/records/${encodeURIComponent(id)}${validateOnly ? "?validateOnly=true" : ""}`),
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
}

export function patchRecord(
  id: string,
  input: RecordPatchInput,
  validateOnly = false,
): Promise<RecordDetailDto | RecordValidationResult> {
  return request<RecordDetailDto | RecordValidationResult>(
    reviewApiPath(`/records/${encodeURIComponent(id)}${validateOnly ? "?validateOnly=true" : ""}`),
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export function deleteRecord(
  id: string,
  options: { validateOnly?: boolean; impactHash?: string } = {},
): Promise<RecordDeleteImpact> {
  const params = new URLSearchParams();
  if (options.validateOnly) {
    params.set("validateOnly", "true");
  }
  if (options.impactHash) {
    params.set("impactHash", options.impactHash);
  }

  return request<RecordDeleteImpact>(
    reviewApiPath(`/records/${encodeURIComponent(id)}${params.size > 0 ? `?${params}` : ""}`),
    {
      method: "DELETE",
    },
  );
}

export function validateRecordsBulk(
  input: BulkRecordValidationInput,
): Promise<BulkRecordValidationResult> {
  return request<BulkRecordValidationResult>(reviewApiPath("/records:bulk"), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateRecordReview(
  id: string,
  input: RecordReviewInput,
): Promise<RecordDetailDto> {
  return request<GraphNode>(reviewApiPath(`/nodes/${encodeURIComponent(id)}/localizations/${input.locale}/review`), {
    method: "PATCH",
    body: JSON.stringify({
      reviewState: input.reviewState,
      reviewerNote: input.reviewerNote,
    }),
  }).then(graphNodeToRecordDetail);
}

export function updateNodeLocalizationReview(
  id: string,
  locale: SupportedLocale,
  input: NodeLocalizationReviewInput,
): Promise<GraphNode> {
  return request<GraphNode>(reviewApiPath(`/nodes/${encodeURIComponent(id)}/localizations/${locale}/review`), {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

function graphNodeToRecordDetail(node: GraphNode): RecordDetailDto {
  const displayLocale = node.displayLocale ?? node.requestedLocale;
  const localization = displayLocale ? node.localizations[displayLocale] : undefined;

  return {
    id: node.id,
    kind: node.kind,
    countryCode: node.countryCode,
    subtype: node.subtype,
    url: node.url,
    recordDepth: node.recordDepth,
    title: localization?.title ?? node.id,
    summary: localization?.summary ?? null,
    availableLocales: node.availableLocales,
    missingLocales: supportedLocales.filter((locale) => !node.availableLocales.includes(locale)),
    reviewStatesByLocale: Object.fromEntries(
      Object.entries(node.localizations).map(([locale, value]) => [locale, value?.reviewState]),
    ),
    requestedLocale: node.requestedLocale,
    displayLocale: node.displayLocale,
    isLocaleFallback: node.isLocaleFallback,
    updatedAt: node.updatedAt,
    record: {
      id: node.id,
      kind: node.kind,
      countryCode: node.countryCode,
      subtype: node.subtype,
      url: node.url,
      recordDepth: node.recordDepth,
      properties: node.properties,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    },
    localizations: node.localizations,
  };
}
