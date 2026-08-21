import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    // Native tsconfig path resolution — no plugin needed.
    tsconfigPaths: true,
    alias: {
      // `server-only` exists to make Next fail a build that imports server
      // code into a client bundle. It has no runtime behaviour, and it is
      // not resolvable outside Next's own bundler — so under test it maps
      // to an empty module. Without this, no file that guards itself with
      // it could ever be tested.
      "server-only": path.resolve(import.meta.dirname, "src/test/empty-module.ts"),
    },
  },
  test: {
    // Node, not jsdom: these cover server-side logic — money arithmetic,
    // GST grouping, the backup manifest, colour conversion. Component tests
    // would need a DOM and a React plugin that currently conflicts with the
    // repo's babel version; the browser-driven checks cover that ground.
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Test files run serially.
    //
    // Several of these are integration tests against one shared database:
    // one creates and deletes supplier rows while another counts every
    // table to prove a backup round-trips. Run in parallel they race, and
    // the failure looks like a backup bug rather than a scheduling one.
    // The whole suite takes about two seconds, so serial costs nothing.
    fileParallelism: false,
  },
});
