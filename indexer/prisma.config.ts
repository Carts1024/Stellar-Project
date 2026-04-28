import { defineConfig, env } from "prisma/config";
import { loadProjectEnvironment } from "./src/load-env.ts";

loadProjectEnvironment();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("INDEXER_DATABASE_URL"),
  },
});