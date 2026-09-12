const { Plugin, Modal, Notice } = require("obsidian");

module.exports = class extends Plugin {
  onload() {
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
  }
};
