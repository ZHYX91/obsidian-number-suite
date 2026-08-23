import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL("./tests/mocks/obsidian.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.ts"],
      thresholds: {
        statements: 50,
        branches: 55,
        functions: 39,
        lines: 51,
        "src/core/**/*.ts": {
          statements: 85,
          branches: 75,
          functions: 95,
          lines: 85,
        },
        "src/application/**/*.ts": {
          statements: 90,
          branches: 80,
          functions: 95,
          lines: 90,
        },
        "src/adapters/**/*.ts": {
          statements: 85,
          branches: 80,
          functions: 95,
          lines: 90,
        },
        "src/reading/**/*.ts": {
          statements: 85,
          branches: 70,
          functions: 85,
          lines: 85,
        },
      },
    },
  },
});
