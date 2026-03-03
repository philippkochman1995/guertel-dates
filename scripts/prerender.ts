import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../src/entry-server";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distIndexPath = path.join(rootDir, "dist", "index.html");

const template = fs.readFileSync(distIndexPath, "utf8");
const appHtml = render("/");
const hydratedHtml = template.replace(
  /<div id="root"><\/div>/,
  `<div id="root">${appHtml}</div>`,
);

if (hydratedHtml === template) {
  throw new Error('Prerender failed: could not find "<div id=\\"root\\"></div>" in dist/index.html');
}

fs.writeFileSync(distIndexPath, hydratedHtml);
console.log("Prerender complete: injected SSR HTML into dist/index.html");
