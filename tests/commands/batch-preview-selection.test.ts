import { describe, expect, it } from "vitest";

import { planChangesSource, planNeedsPreview } from "../../src/commands/batch";
import type { TransformPlan } from "../../src/core/types";

function plan(overrides: Partial<TransformPlan>): TransformPlan {
  return {
    operation: "write",
    source: "# A",
    result: "# A",
    changes: [],
    warnings: [],
    ...overrides,
  };
}

describe("batch preview selection", () => {
  it("keeps warning-only documents in the preview without treating them as writes", () => {
    const warningOnly = plan({
      warnings: [{
        line: 0,
        heading: "1 A",
        code: "ambiguous-prefix",
        detail: "Ambiguous",
      }],
    });
    expect(planNeedsPreview(warningOnly)).toBe(true);
    expect(planChangesSource(warningOnly)).toBe(false);
  });

  it("treats a changed result as a write even when a synthetic plan omits change rows", () => {
    expect(planChangesSource(plan({ result: "# 1 A" }))).toBe(true);
  });
});
