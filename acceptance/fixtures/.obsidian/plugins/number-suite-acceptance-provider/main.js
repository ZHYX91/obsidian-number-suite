const { Plugin, Modal, Notice } = require("obsidian");

module.exports = class extends Plugin {
  onload() {
    this.addCommand({
      id: "conflict-next-note-save",
      name: "Simulate concurrent H1 change on next note save",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file?.path !== "Controls.md") {
          new Notice("Open Controls before arming the conflict fixture");
          return;
        }
        this.restoreNoteSave?.();
        const manager = this.app.fileManager;
        const original = manager.processFrontMatter;
        const restore = () => {
          if (manager.processFrontMatter === wrapped) manager.processFrontMatter = original;
          this.restoreNoteSave = null;
        };
        const wrapped = async function (target, callback, ...args) {
          if (target !== file) return original.call(this, target, callback, ...args);
          restore();
          await original.call(this, target, (values) => {
            const entries = Array.isArray(values["number-suite"]) ? values["number-suite"] : [];
            values["number-suite"] = [
              ...entries.filter((value) => !String(value).startsWith("heading.first-number.h1=")),
              "heading.first-number.h1=7",
            ];
          });
          return original.call(this, target, callback, ...args);
        };
        manager.processFrontMatter = wrapped;
        this.restoreNoteSave = restore;
        new Notice("The next Controls save will encounter a concurrent H1 value of 7");
      },
    });
    this.addCommand({
      id: "delay-next-preview",
      name: "Delay next preview apply for 20 seconds",
      callback: () => {
        this.restore?.();
        const original = Modal.prototype.open;
        const restore = () => {
          if (Modal.prototype.open === wrapped) Modal.prototype.open = original;
          this.restore = null;
        };
        const wrapped = function (...args) {
          const options = this.options;
          if (Array.isArray(options?.documents) && typeof options.onConfirm === "function") {
            restore();
            const confirm = options.onConfirm;
            options.onConfirm = async (...confirmArgs) => {
              await new Promise((resolve) => setTimeout(resolve, 20000));
              return confirm(...confirmArgs);
            };
          }
          return original.apply(this, args);
        };
        this.restore = restore;
        Modal.prototype.open = wrapped;
        new Notice("Next preview apply will wait 20 seconds (acceptance fixture)");
      },
    });
  }

  onunload() {
    this.restore?.();
    this.restoreNoteSave?.();
  }
};
