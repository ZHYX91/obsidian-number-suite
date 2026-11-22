// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { expect, it, vi } from "vitest";
import { SemanticSnapshotCache } from "../../src/application/semantic-snapshot";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { HeadingDisplayController } from "../../src/editor/heading-display-extension";

it("skips tooltip source scans while editing plain text with source display disabled", async () => {
  const settings = { ...DEFAULT_SETTINGS, enableSourceMode: false };
  const snapshot = vi.spyOn(SemanticSnapshotCache.prototype, "get");
  const controller = new HeadingDisplayController(() => settings);
  const parent = document.body.appendChild(document.createElement("div"));
  const view = new EditorView({ parent, state: EditorState.create({
    doc: "Plain text", extensions: [controller.createExtension()],
  }) });
  try {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    view.dispatch({ changes: { from: view.state.doc.length, insert: " edited" } });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    expect(snapshot).not.toHaveBeenCalled();
  } finally {
    view.destroy();
    parent.remove();
    snapshot.mockRestore();
  }
});
