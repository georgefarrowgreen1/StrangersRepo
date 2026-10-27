// Builds dist/ for the Worker's static assets.
// Copies public/ and turns reference/kitchen-diary.html into dist/index.html with exactly two edits:
//   1. <meta name="robots" content="noindex,nofollow"> in the <head>
//   2. <script src="/claude-shim.js"></script> before the page's main <script>
// The reference file itself is never modified, so a new version from Will can be dropped in as-is.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "reference", "kitchen-diary.html");
const out = join(root, "dist");

let html = readFileSync(src, "utf8");

function fail(msg) {
  console.error(`build: ${msg}\nThe page's structure has changed; update scripts/build.mjs to match.`);
  process.exit(1);
}

// After <meta charset> (which should stay first), or straight after <head>.
const anchor = html.match(/<meta charset[^>]*>/i) || html.match(/<head[^>]*>/i);
if (!anchor) fail("no <head> in reference/kitchen-diary.html");
html = html.replace(anchor[0], `${anchor[0]}<meta name="robots" content="noindex,nofollow">`);

const scripts = [...html.matchAll(/<script>/g)];
if (scripts.length !== 1) fail(`expected exactly one inline <script>, found ${scripts.length}`);
html = html.replace("<script>", `<script src="/claude-shim.js"></script>\n<script>`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "public"), out, { recursive: true });
writeFileSync(join(out, "index.html"), html);
console.log("build: wrote dist/index.html");
