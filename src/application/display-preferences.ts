import type { DisplayPreferences } from "../core/types";

export type DisplayPreferenceAction = "normal" | "show" | "conceal";
export type DisplayPreferenceNoticeKey =
  | "notice.display.restored"
  | "notice.display.showOn"
  | "notice.display.showOff"
  | "notice.display.concealOn"
  | "notice.display.concealOff";

export interface DisplayPreferenceUpdate extends DisplayPreferences {
  readonly noticeKey: DisplayPreferenceNoticeKey;
}

export function canRestoreSourceAppearance(preferences: DisplayPreferences): boolean {
  return preferences.showVirtualNumbers || preferences.concealStoredNumbers;
}

export function updateDisplayPreferences(
  preferences: DisplayPreferences,
  action: DisplayPreferenceAction,
): DisplayPreferenceUpdate {
  if (action === "normal") {
    return {
      showVirtualNumbers: false,
      concealStoredNumbers: false,
      noticeKey: "notice.display.restored",
    };
  }
  if (action === "show") {
    const showVirtualNumbers = !preferences.showVirtualNumbers;
    return {
      showVirtualNumbers,
      concealStoredNumbers: preferences.concealStoredNumbers,
      noticeKey: showVirtualNumbers ? "notice.display.showOn" : "notice.display.showOff",
    };
  }
  const concealStoredNumbers = !preferences.concealStoredNumbers;
  return {
    showVirtualNumbers: preferences.showVirtualNumbers,
    concealStoredNumbers,
    noticeKey: concealStoredNumbers ? "notice.display.concealOn" : "notice.display.concealOff",
  };
}
