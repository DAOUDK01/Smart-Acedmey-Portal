import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./client/test/setup.ts"],
    include: ["client/**/*.test.ts", "client/**/*.test.tsx"],
    alias: {
      "@": path.resolve(__dirname, "./client"),
    },
  },
});