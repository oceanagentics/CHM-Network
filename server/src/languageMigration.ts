import type {
  LocalizedNodeDataDetails,
  LocalizedSystemAccessPath,
  LocalizedSystemGalleryItem,
  LocalizedSourcedMetric,
  NodeLocalizationDetails,
  NodeProperties,
  ReviewState,
  SourcedMetric,
  SourceRef,
  SystemAccessPath,
  SystemAccessType,
  SystemDataDescriptor,
  SystemGalleryItem,
} from "../../shared/domain";
import { emptyLocalizationDetails } from "../../shared/localization";
import { isRecord, isReviewState, normalizeString } from "./graphRepositorySupport";

export const languageMigrationId = "2026-09-01-node-localizations";

export type LegacyNodeRow = {
  id: string;
  name: string;
  summary: string | null;
  description: string | null;
  review_state: ReviewState;
  review_json: Record<string, unknown>;
  details_json: Record<string, unknown>;
  properties_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type MigratedNodeContent = {
  propertiesJson: NodeProperties;
  localization: {
    nodeId: string;
    locale: "en";
    title: string;
    summary: string | null;
    description: string | null;
    detailsJson: NodeLocalizationDetails;
    sourceExcerpt: string | null;
    translatedFromLocale: null;
    contentUpdatedAt: string;
    reviewState: ReviewState;
    reviewerNote: string | null;
    reviewer: string | null;
    lastReviewed: string | null;
    createdAt: string;
    updatedAt: string;
  };
};

const neutralDetailKeys = new Set([
  "operator",
  "role",
  "disciplineFamily",
  "geographicScope",
  "gallery",
  "data",
  "access",
  "identifiers",
  "usage",
]);

export function normalizeAccessType(value: unknown): SystemAccessType | null {
  if (value === "read" || value === "submit" || value === "partner_sync") {
    return value;
  }
  if (value === "service" || value === "documentation" || value === "download") {
    return "read";
  }
  if (value === "none") {
    return null;
  }

  throw new Error(`unexpected access type: ${String(value)}`);
}

function readSourceRef(value: unknown): SourceRef {
  if (!isRecord(value)) {
    return { id: "", title: "Source not recorded", url: "" };
  }

  return {
    id: normalizeString(value.id) ?? "",
    title: normalizeString(value.title) ?? "Source not recorded",
    url: normalizeString(value.url) ?? "",
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => normalizeString(item))
        .filter((item): item is string => Boolean(item))
    : [];
}

function readMetric(value: unknown): SourcedMetric | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeString(value.id);
  const key = normalizeString(value.key);
  const unit = normalizeString(value.unit);
  const numericValue = typeof value.value === "number" ? value.value : Number(value.value);
  if (!id || !key || !unit || !Number.isFinite(numericValue)) {
    return null;
  }

  return {
    id,
    key,
    value: numericValue,
    unit,
    observedAt: normalizeString(value.observedAt),
    source: readSourceRef(value.source),
  };
}

function readMetricText(value: unknown): LocalizedSourcedMetric | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeString(value.id);
  if (!id) {
    return null;
  }

  return {
    id,
    description: normalizeString(value.description),
  };
}

function readDescriptor(value: unknown): SystemDataDescriptor | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeString(value.id);
  const category = normalizeString(value.category);
  const label = normalizeString(value.label);
  if (!id || !label || (category !== "type" && category !== "format" && category !== "standard")) {
    return null;
  }

  return {
    id,
    category,
    label,
    source: isRecord(value.source) ? readSourceRef(value.source) : null,
  };
}

function readDescriptorText(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeString(value.id);
  if (!id) {
    return null;
  }

  return {
    id,
    description: normalizeString(value.description),
  };
}

function isLegacyIdentifierDescriptor(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const id = normalizeString(value.id)?.toLowerCase() ?? "";
  const label = normalizeString(value.label)?.toLowerCase() ?? "";
  const description = normalizeString(value.description)?.toLowerCase() ?? "";
  return id.includes("identifier") || label.includes("identifier") || description.includes("identifier");
}

function readGalleryItem(value: unknown): SystemGalleryItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeString(value.id);
  const type = normalizeString(value.type);
  const url = normalizeString(value.url);
  if (!id || !url || (type !== "image" && type !== "embed")) {
    return null;
  }

  return {
    id,
    type,
    url,
    thumbnailUrl: normalizeString(value.thumbnailUrl),
    source: readSourceRef(value.source),
    sortOrder: typeof value.sortOrder === "number" ? value.sortOrder : 0,
  };
}

function readGalleryText(value: unknown): LocalizedSystemGalleryItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeString(value.id);
  if (!id) {
    return null;
  }

  return {
    id,
    title: normalizeString(value.title),
    caption: normalizeString(value.caption),
    altText: normalizeString(value.altText),
  };
}

function splitAccess(values: unknown[]): {
  neutral: SystemAccessPath[];
  localized: LocalizedSystemAccessPath[];
} {
  const neutral: SystemAccessPath[] = [];
  const localized: LocalizedSystemAccessPath[] = [];

  for (const value of values) {
    if (!isRecord(value)) {
      continue;
    }

    const type = normalizeAccessType(value.type);
    if (!type) {
      continue;
    }

    const id = normalizeString(value.id);
    const method = normalizeString(value.method);
    const url = normalizeString(value.url);
    if (!id || !method || !url) {
      continue;
    }

    neutral.push({
      id,
      type,
      method,
      url,
      source: readSourceRef(value.source),
    });
    localized.push({
      id,
      label: normalizeString(value.label),
      description: normalizeString(value.description),
    });
  }

  return { neutral, localized };
}

function splitData(value: unknown): {
  neutral: NonNullable<NodeProperties["data"]>;
  localized: LocalizedNodeDataDetails;
} {
  const data = isRecord(value) ? value : {};
  const descriptors = Array.isArray(data.descriptors)
    ? data.descriptors.filter((descriptor) => !isLegacyIdentifierDescriptor(descriptor))
    : [];

  return {
    neutral: {
      descriptors: descriptors
        .map(readDescriptor)
        .filter((descriptor): descriptor is SystemDataDescriptor => Boolean(descriptor)),
      recordCount: readMetric(data.recordCount),
      storageSize: readMetric(data.storageSize),
    },
    localized: {
      descriptors: descriptors
        .map(readDescriptorText)
        .filter((descriptor): descriptor is LocalizedNodeDataDetails["descriptors"][number] => Boolean(descriptor)),
      recordCount: readMetricText(data.recordCount),
      storageSize: readMetricText(data.storageSize),
    },
  };
}

function readReviewString(review: Record<string, unknown>, key: string): string | null {
  return normalizeString(review[key]);
}

export function splitLegacyNodeContent(row: LegacyNodeRow): MigratedNodeContent {
  const details = isRecord(row.details_json) ? row.details_json : {};
  const properties = isRecord(row.properties_json)
    ? { ...row.properties_json } as NodeProperties
    : {};
  const data = splitData(details.data);
  const accessValues = Array.isArray(details.access) ? details.access : [];
  const access = splitAccess(accessValues);
  const galleryValues = Array.isArray(details.gallery) ? details.gallery : [];
  const usageValues = Array.isArray(details.usage) ? details.usage : [];
  const localizedDetails: NodeLocalizationDetails = {
    ...emptyLocalizationDetails(),
    ...Object.fromEntries(
      Object.entries(details).filter(([key]) => !neutralDetailKeys.has(key)),
    ),
    aliases: asStringArray(details.aliases),
    gallery: galleryValues
      .map(readGalleryText)
      .filter((item): item is LocalizedSystemGalleryItem => Boolean(item)),
    data: data.localized,
    access: access.localized,
    usage: usageValues
      .map(readMetricText)
      .filter((metric): metric is LocalizedSourcedMetric => Boolean(metric)),
  };

  return {
    propertiesJson: {
      ...properties,
      operator: isRecord(details.operator)
        ? {
            id: normalizeString(details.operator.id) ?? "",
            name: normalizeString(details.operator.name) ?? "",
            countryCode: normalizeString(details.operator.countryCode),
          }
        : null,
      role: normalizeString(details.role),
      disciplineFamily: normalizeString(details.disciplineFamily),
      geographicScope: normalizeString(details.geographicScope),
      gallery: galleryValues
        .map(readGalleryItem)
        .filter((item): item is SystemGalleryItem => Boolean(item)),
      data: data.neutral,
      access: access.neutral,
      usage: usageValues
        .map(readMetric)
        .filter((metric): metric is SourcedMetric => Boolean(metric)),
    },
    localization: {
      nodeId: row.id,
      locale: "en",
      title: row.name,
      summary: row.summary,
      description: row.description,
      detailsJson: localizedDetails,
      sourceExcerpt: null,
      translatedFromLocale: null,
      contentUpdatedAt: row.updated_at,
      reviewState: isReviewState(row.review_state) ? row.review_state : "agent_researched",
      reviewerNote: readReviewString(row.review_json, "reviewerNote"),
      reviewer: readReviewString(row.review_json, "reviewer"),
      lastReviewed: readReviewString(row.review_json, "lastReviewed"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  };
}

export function validateMigratedNodeContent(content: MigratedNodeContent): string[] {
  const errors: string[] = [];
  if ("identifiers" in content.propertiesJson) {
    errors.push(`${content.localization.nodeId}: properties_json still has identifiers`);
  }
  if ("identifiers" in content.localization.detailsJson) {
    errors.push(`${content.localization.nodeId}: localization details_json still has identifiers`);
  }

  const access = content.propertiesJson.access ?? [];
  const accessIds = new Set<string>();
  for (const row of access) {
    if (accessIds.has(row.id)) {
      errors.push(`${content.localization.nodeId}: duplicate access id ${row.id}`);
    }
    accessIds.add(row.id);
    if (!normalizeAccessType(row.type)) {
      errors.push(`${content.localization.nodeId}: unexpected access type ${row.type}`);
    }
  }

  for (const row of content.localization.detailsJson.access) {
    if (row.id && !accessIds.has(row.id)) {
      errors.push(`${content.localization.nodeId}: localized access id ${row.id} has no neutral row`);
    }
  }

  return errors;
}
