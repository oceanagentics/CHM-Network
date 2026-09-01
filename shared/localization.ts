import type {
  GraphNode,
  NodeLocalizationDetails,
  ResolvedNodeLocalization,
  SupportedLocale,
} from "./domain";

export const supportedLocales = ["ar", "zh", "en", "fr", "ru", "es"] as const;
export const defaultLocale = "en" satisfies SupportedLocale;

const supportedLocaleSet = new Set<string>(supportedLocales);

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && supportedLocaleSet.has(value);
}

export function normalizeLocale(value: unknown): SupportedLocale {
  return isSupportedLocale(value) ? value : defaultLocale;
}

export function emptyLocalizationDetails(): NodeLocalizationDetails {
  return {
    aliases: [],
    gallery: [],
    data: {
      descriptors: [],
      recordCount: null,
      storageSize: null,
    },
    access: [],
    usage: [],
  };
}

export function resolveNodeLocalization(
  node: GraphNode,
  requestedLocale: SupportedLocale = defaultLocale,
): ResolvedNodeLocalization {
  const displayLocale =
    node.localizations[requestedLocale]?.locale ??
    node.localizations[defaultLocale]?.locale ??
    node.availableLocales
      .map((locale) => node.localizations[locale]?.locale)
      .find((locale): locale is SupportedLocale => Boolean(locale)) ??
    null;
  const localization = displayLocale ? node.localizations[displayLocale] : null;

  return {
    requestedLocale,
    displayLocale,
    isLocaleFallback: displayLocale !== requestedLocale,
    hasLocalization: Boolean(localization),
    title: localization?.title ?? node.id,
    summary: localization?.summary ?? null,
    description: localization?.description ?? null,
    details: localization?.details ?? emptyLocalizationDetails(),
    sourceExcerpt: localization?.sourceExcerpt ?? null,
    translatedFromLocale: localization?.translatedFromLocale ?? null,
    contentUpdatedAt: localization?.contentUpdatedAt ?? null,
    reviewState: localization?.reviewState ?? null,
    reviewerNote: localization?.reviewerNote ?? null,
    reviewer: localization?.reviewer ?? null,
    lastReviewed: localization?.lastReviewed ?? null,
    createdAt: localization?.createdAt ?? null,
    updatedAt: localization?.updatedAt ?? null,
  };
}

export function nodeDisplayTitle(
  node: GraphNode,
  requestedLocale: SupportedLocale = defaultLocale,
): string {
  return resolveNodeLocalization(node, requestedLocale).title;
}
