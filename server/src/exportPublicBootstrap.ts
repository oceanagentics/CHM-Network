import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { GraphBootstrapPayload } from "../../shared/domain";
import { getDatabase } from "./db";
import { SqliteGraphRepository } from "./sqliteGraphRepository";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const outputDir = path.join(repoRoot, "client", "public");
const outputPath = path.join(outputDir, "bootstrap.public.json");

function toPublicBootstrap(payload: GraphBootstrapPayload): GraphBootstrapPayload {
  return {
    ...payload,
    sources: payload.sources.map((source) => ({
      ...source,
      localPath: null,
    })),
  };
}

const repository = new SqliteGraphRepository(getDatabase());
const bootstrap = toPublicBootstrap(repository.getBootstrap());

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(bootstrap, null, 2)}\n`, "utf8");

console.log(`Wrote public bootstrap to ${outputPath}`);
