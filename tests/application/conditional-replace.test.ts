import { describe, expect, it } from "vitest";

import {
  ContentConflictError,
  replaceExactly,
  rollbackExactly,
} from "../../src/application/conditional-replace";

interface Target {
  readonly path: string;
}

function processor(initial: Readonly<Record<string, string>>) {
  const contents = new Map(Object.entries(initial));
  return {
    contents,
    process: async (target: Target, transform: (current: string) => string) => {
      const current = contents.get(target.path);
      if (current == null) throw new Error(`Missing ${target.path}`);
      const next = transform(current);
      contents.set(target.path, next);
      return next;
    },
  };
}

describe("guarded text replacements", () => {
  it("replaces only the exact expected content", async () => {
    const host = processor({ "note.md": "before" });
    await replaceExactly(host, { path: "note.md" }, "before", "after");
    expect(host.contents.get("note.md")).toBe("after");
    await expect(replaceExactly(host, { path: "note.md" }, "before", "other"))
      .rejects.toBeInstanceOf(ContentConflictError);
    expect(host.contents.get("note.md")).toBe("after");
  });

  it("does not overwrite a concurrent edit while rolling back other replacements", async () => {
    const host = processor({ "a.md": "written-a", "b.md": "user-edit" });
    const failures = await rollbackExactly(host, [
      { target: { path: "a.md" }, before: "before-a", after: "written-a" },
      { target: { path: "b.md" }, before: "before-b", after: "written-b" },
    ]);
    expect(failures).toHaveLength(1);
    expect(host.contents.get("a.md")).toBe("before-a");
    expect(host.contents.get("b.md")).toBe("user-edit");
  });
});
