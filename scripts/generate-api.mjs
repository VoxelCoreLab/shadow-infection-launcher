import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateApi } from "swagger-typescript-api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const apis = [
  {
    name: "patch-notes",
    url: "https://patch-notes.shadowinfection.com/api-json",
    output: path.join(root, "src/api/generated/patch-notes"),
  },
  {
    name: "shop",
    url: "https://shop-api.shadowinfection.com/api-json",
    output: path.join(root, "src/api/generated/shop"),
  },
];

for (const api of apis) {
  console.info(`Generating ${api.name} client…`);
  await generateApi({
    name: "Api.ts",
    url: api.url,
    output: api.output,
    httpClientType: "fetch",
    cleanOutput: true,
    generateClient: true,
    silent: false,
  });
}

console.info("Done.");
