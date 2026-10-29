// Prints a GitHub Actions error annotation with the failing part of a node:test log (from "not ok" on),
// so the reason shows on the check itself. Usage: node .github/annotate.mjs "<title>" <log file>
import { readFileSync } from "node:fs";
const [title, file] = process.argv.slice(2);
const log = readFileSync(file, "utf8").split("\n");
const i = log.findIndex((l) => /^\s*not ok /.test(l));
const part = (i < 0 ? log.slice(-60) : log.slice(i, i + 60)).filter((l) => !/^\s+at /.test(l)).join("\n").slice(0, 3500);
const esc = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
console.log(`::error title=${esc(title)}::${esc(part)}`);
