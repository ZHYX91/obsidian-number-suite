interface ObsidianSettingsApi {
  open(): void;
  openTabById(id: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null;
}

function isSettingsApi(value: unknown): value is ObsidianSettingsApi {
  return isRecord(value)
    && typeof value["open"] === "function"
    && typeof value["openTabById"] === "function";
}

export function openObsidianPluginSettings(app: unknown, pluginId: string): boolean {
  const settings = isRecord(app) ? app["setting"] : null;
  if (!isSettingsApi(settings)) return false;
  settings.open();
  settings.openTabById(pluginId);
  return true;
}
