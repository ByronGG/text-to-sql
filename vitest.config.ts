import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests cover the pure logic only (SQL guard, table-name derivation, cache
// keying/LRU, chart heuristics, eval comparator) — no DuckDB, no network. The
// end-to-end behaviour is exercised by the `/eval` page instead.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
