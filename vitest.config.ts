import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    typecheck: {
      // Several defects here were a signature promising one thing while the
      // node was another, which no runtime assertion can see.
      include: ["src/**/*.test-d.ts"],
    },
  },
});