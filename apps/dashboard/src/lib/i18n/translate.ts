export type TranslationParams = Record<string, string | number>;

export interface TranslationTree {
  [key: string]: string | TranslationTree;
}

function lookup(tree: TranslationTree, path: string): string | undefined {
  const segments = path.split(".");
  let current: string | TranslationTree | undefined = tree;
  for (const segment of segments) {
    if (current === undefined || typeof current === "string") return undefined;
    current = current[segment];
  }
  return typeof current === "string" ? current : undefined;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

export function translate(
  dictionaries: Record<string, TranslationTree>,
  locale: string,
  fallbackLocale: string,
  path: string,
  params?: TranslationParams,
): string {
  const primary = dictionaries[locale];
  const fromPrimary = primary ? lookup(primary, path) : undefined;
  if (fromPrimary !== undefined) return interpolate(fromPrimary, params);

  if (locale !== fallbackLocale) {
    const fallback = dictionaries[fallbackLocale];
    const fromFallback = fallback ? lookup(fallback, path) : undefined;
    if (fromFallback !== undefined) return interpolate(fromFallback, params);
  }

  return path;
}
