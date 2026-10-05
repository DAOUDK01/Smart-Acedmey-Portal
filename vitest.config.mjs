import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Components are written for Next's automatic JSX runtime (no `import React`).
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./client/test/setup.ts"],
    include: ["client/**/*.test.ts", "client/**/*.test.tsx"],
    alias: {
      "@": fileURLToPath(new URL("./client", import.meta.url)),
    },
  },
});
