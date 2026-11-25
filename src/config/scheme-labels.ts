import type { Translate } from "./i18n";
import type { NumberSuiteSettings } from "./settings";
import { isBuiltInSchemeId } from "../core/schemes";
import { BUILT_IN_SCHEME_IDS } from "../core/types";

export function schemeDisplayName(
  id: string,
  settings: NumberSuiteSettings,
  t: Translate,
): string {
  if (isBuiltInSchemeId(id)) {
    const name = t(`scheme.${id}`);
    return settings.disabledBuiltInSchemeIds.includes(id) ? t("panel.scheme.disabled", { name }) : name;
  }
  const custom = settings.customSchemes.find((scheme) => scheme.id === id);
  if (custom == null) return id;
  return custom.name;
}

export function noteSchemeOptions(
  settings: NumberSuiteSettings,
  currentId: string | null,
  t: Translate,
): ReadonlyArray<readonly [string, string]> {
  const visibleBuiltIns = BUILT_IN_SCHEME_IDS.filter((id) => (
    !settings.disabledBuiltInSchemeIds.includes(id) || id === currentId
  ));
  const options: Array<readonly [string, string]> = visibleBuiltIns.map((id) => [
    id,
    schemeDisplayName(id, settings, t),
  ]);
  for (const scheme of settings.customSchemes) {
    options.push([scheme.id, schemeDisplayName(scheme.id, settings, t)]);
  }
  if (currentId != null && !options.some(([id]) => id === currentId)) {
    options.push([currentId, t("panel.scheme.unavailable", { id: currentId })]);
  }
  return options;
}
