import type {
  GraphNode,
  LocalizedSystemAccessPath,
  LocalizedSystemGalleryItem,
  LocalizedSourcedMetric,
  NodeLocalizationDetails,
  ResolvedNodeLocalization,
  SourcedMetric,
  SupportedLocale,
  SystemAccessPath,
  SystemGalleryItem,
} from "../../../shared/domain";
import {
  defaultLocale,
  emptyLocalizationDetails,
  resolveNodeLocalization,
} from "../../../shared/localization";

export type ResolvedSystemAccessPath = SystemAccessPath & {
  label: string;
  description: string | null;
  instructions: string | null;
  caveats: string[];
};

export type ResolvedSystemGalleryItem = SystemGalleryItem & {
  title: string | null;
  caption: string | null;
  altText: string | null;
};

export type ResolvedSourcedMetric = SourcedMetric & {
  description: string | null;
};

export function resolveNodeDisplay(
  node: GraphNode,
  locale: SupportedLocale = defaultLocale,
): ResolvedNodeLocalization {
  return resolveNodeLocalization(node, locale);
}

export function nodeTitle(node: GraphNode, locale: SupportedLocale = defaultLocale): string {
  return resolveNodeDisplay(node, locale).title;
}

export function localizationDetails(
  localization: ResolvedNodeLocalization,
): NodeLocalizationDetails {
  return localization.details ?? emptyLocalizationDetails();
}

function byId<T extends { id: string }>(values: T[] | undefined): Record<string, T> {
  return Object.fromEntries((values ?? []).map((value) => [value.id, value]));
}

export function systemGallery(
  system: GraphNode,
  localization: ResolvedNodeLocalization,
): ResolvedSystemGalleryItem[] {
  const localizedById = byId<LocalizedSystemGalleryItem>(localizationDetails(localization).gallery);

  return (system.properties.gallery ?? []).map((item) => {
    const localized = localizedById[item.id];
    return {
      ...item,
      title: localized?.title ?? null,
      caption: localized?.caption ?? null,
      altText: localized?.altText ?? null,
    };
  });
}

export function systemAccessPaths(
  system: GraphNode,
  localization: ResolvedNodeLocalization,
): ResolvedSystemAccessPath[] {
  const localizedById = byId<LocalizedSystemAccessPath>(localizationDetails(localization).access);

  return (system.properties.access ?? []).map((path) => {
    const localized = localizedById[path.id];
    return {
      ...path,
      label: localized?.label ?? path.method,
      description: localized?.description ?? null,
      instructions: localized?.instructions ?? null,
      caveats: localized?.caveats ?? [],
    };
  });
}

export function resolveMetric(
  metric: SourcedMetric | null | undefined,
  localizedMetric: LocalizedSourcedMetric | null | undefined,
): ResolvedSourcedMetric | null {
  if (!metric) {
    return null;
  }

  return {
    ...metric,
    description: localizedMetric?.description ?? null,
  };
}

export function localizedMetricById(
  values: LocalizedSourcedMetric[] | undefined,
): Record<string, LocalizedSourcedMetric> {
  return byId(values);
}
