import { formatCounter } from "./number-formats";
import { renderCurrentLevel, renderTemplate } from "./template-compiler";
import {
  BUILT_IN_SCHEME_IDS,
  type BuiltInSchemeId,
  type CustomNumberingScheme,
  type NumberingScheme,
} from "./types";

const HIERARCHICAL_TEMPLATES = [
  "{1.arabic}",
  "{1.arabic}.{2.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}.{4.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}.{4.arabic}.{5.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}.{4.arabic}.{5.arabic}.{6.arabic}",
] as const;

export const BUILT_IN_SCHEMES: Readonly<Record<BuiltInSchemeId, NumberingScheme>> = {
  hierarchical: {
    id: "hierarchical",
    baseLevel: 1,
    templates: HIERARCHICAL_TEMPLATES,
    exclusions: [],
  },
  "hierarchical-h2": {
    id: "hierarchical-h2",
    baseLevel: 2,
    templates: [
      "",
      "{2.arabic}",
      "{2.arabic}.{3.arabic}",
      "{2.arabic}.{3.arabic}.{4.arabic}",
      "{2.arabic}.{3.arabic}.{4.arabic}.{5.arabic}",
      "{2.arabic}.{3.arabic}.{4.arabic}.{5.arabic}.{6.arabic}",
    ],
    exclusions: [],
  },
  "chinese-official": {
    id: "chinese-official",
    baseLevel: 1,
    templates: [
      "{1.chinese_lower}、",
      "（{2.chinese_lower}）",
      "{3.arabic}.",
      "（{4.arabic}）",
      "{5.circled}",
      "{6.letter_lower}.",
    ],
    exclusions: [],
  },
  legal: {
    id: "legal",
    baseLevel: 1,
    templates: [
      "第{1.chinese_lower}编",
      "第{2.chinese_lower}章",
      "第{3.chinese_lower}节",
      "第{4.chinese_lower}条",
      "（{5.chinese_lower}）",
      "{6.arabic}.",
    ],
    exclusions: [],
  },
};

export { formatCounter, renderCurrentLevel, renderTemplate };

export function isBuiltInSchemeId(value: string): value is BuiltInSchemeId {
  return BUILT_IN_SCHEME_IDS.includes(value as BuiltInSchemeId);
}

export function findMatchingBuiltInSchemeId(
  scheme: Pick<NumberingScheme, "baseLevel" | "templates"> & Pick<Partial<NumberingScheme>, "exclusions">,
): BuiltInSchemeId | null {
  if ((scheme.exclusions?.length ?? 0) > 0) return null;
  for (const id of BUILT_IN_SCHEME_IDS) {
    const builtIn = BUILT_IN_SCHEMES[id];
    if (scheme.baseLevel !== builtIn.baseLevel) continue;
    if (builtIn.templates.every((template, index) => template === (scheme.templates[index] ?? ""))) {
      return id;
    }
  }
  return null;
}

export function resolveScheme(
  id: string,
  customSchemes: readonly CustomNumberingScheme[],
  fallback: BuiltInSchemeId = "hierarchical-h2",
): NumberingScheme {
  if (isBuiltInSchemeId(id)) return BUILT_IN_SCHEMES[id];
  return customSchemes.find((scheme) => scheme.id === id) ?? BUILT_IN_SCHEMES[fallback];
}
