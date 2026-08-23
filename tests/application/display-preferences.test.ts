import { describe, expect, it } from "vitest";

import {
  canRestoreSourceAppearance,
  updateDisplayPreferences,
} from "../../src/application/display-preferences";

describe("display preference actions", () => {
  it("keeps virtual display and concealment independent", () => {
    const shown = updateDisplayPreferences({
      showVirtualNumbers: false,
      concealStoredNumbers: true,
    }, "show");
    expect(shown).toEqual({
      showVirtualNumbers: true,
      concealStoredNumbers: true,
      noticeKey: "notice.display.showOn",
    });
    expect(canRestoreSourceAppearance(shown)).toBe(true);

    const revealed = updateDisplayPreferences(shown, "conceal");
    expect(revealed).toEqual({
      showVirtualNumbers: true,
      concealStoredNumbers: false,
      noticeKey: "notice.display.concealOff",
    });
  });

  it("exposes restore only for an active effect and clears both effects", () => {
    expect(canRestoreSourceAppearance({
      showVirtualNumbers: false,
      concealStoredNumbers: false,
    })).toBe(false);
    expect(updateDisplayPreferences({
      showVirtualNumbers: true,
      concealStoredNumbers: true,
    }, "normal")).toEqual({
      showVirtualNumbers: false,
      concealStoredNumbers: false,
      noticeKey: "notice.display.restored",
    });
  });
});
