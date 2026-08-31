import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { toPublicBootstrap } from "./server";
import { createGraphRepository } from "./repositoryFactory";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const outputDir = path.join(repoRoot, "client", "public");
const outputPath = path.join(outputDir, "bootstrap.public.json");

async function main() {
  const repository = createGraphRepository();
  try {
    const bootstrap = toPublicBootstrap(await repository.getBootstrap());

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(bootstrap, null, 2)}\n`, "utf8");

    console.log(`Wrote public bootstrap to ${outputPath}`);
  } finally {
    await repository.close?.();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
