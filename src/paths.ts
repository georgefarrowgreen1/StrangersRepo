import { invalid } from "./http";

// See docs/data-model.md. The Roastery's records are at the top level; the other sites are under sites/<id>/.
export const SITE_PREFIXES = ["", "sites/cafe/", "sites/asg/", "sites/factory/"];

export const COLLECTIONS = [
  "settings", "days", "weeks", "extras", "cleaning", "proveit", "allergens", "allergenDocs",
  "suppliers", "contacts", "staff", "reviews", "plans", "onboarding", "inspections",
];

/** Collections that are never synced with Claude (docs/sync.md). */
const UNSYNCED = new Set(["allergenDocs"]);

/** Single documents outside the per-site collections. config/people and config/sync are sync-only. */
const CONFIG_DOCS = new Set(["config/shared", "config/people", "config/sync"]);

const SITE_COLLECTIONS = new Set(SITE_PREFIXES.flatMap((p) => COLLECTIONS.map((c) => p + c)));

/** Every collection the sync may list in a manifest. */
export const SYNCED_COLLECTIONS = [...SITE_COLLECTIONS].filter((c) => !UNSYNCED.has(c.split("/").pop()!));

const ID_RE = /^[^/\u0000-\u001f\u007f]{1,200}$/;

export interface DocPath {
  path: string;
  collection: string;
  id: string;
}

export function parseDocPath(path: unknown): DocPath {
  if (typeof path !== "string") throw invalid("Path must be a string.");
  const parts = path.split("/");
  if (parts.length % 2 !== 0 || parts.some((p) => p === "")) throw invalid(`Not a document path: ${path}`);
  const id = parts.pop()!;
  const collection = parts.join("/");
  if (!ID_RE.test(id) || id === "." || id === "..") throw invalid(`Invalid document id: ${path}`);
  if (!SITE_COLLECTIONS.has(collection) && !CONFIG_DOCS.has(path)) throw invalid(`Path not allowed: ${path}`);
  return { path, collection, id };
}

export function parseCollectionPath(path: unknown): string {
  if (typeof path !== "string" || !SITE_COLLECTIONS.has(path)) throw invalid(`Collection not allowed: ${String(path)}`);
  return path;
}

/** Paths the website itself (the page) may read and write. */
export function parseWebDocPath(path: unknown, mode: "read" | "write"): DocPath {
  const p = parseDocPath(path);
  if (p.path === "config/sync") throw invalid("config/sync is only used by the sync.");
  if (mode === "write" && p.path === "config/people") throw invalid("config/people is written only by the sync.");
  return p;
}

export function isSynced(path: string): boolean {
  if (path === "config/sync") return false;
  const parts = path.split("/");
  return !UNSYNCED.has(parts[parts.length - 2]);
}

export const MAX_DOC_BYTES = 256 * 1024;

/** Validates document data and returns its JSON text. */
export function encodeDoc(data: unknown): string {
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw invalid("Document data must be an object.");
  const text = JSON.stringify(data);
  if (new TextEncoder().encode(text).length > MAX_DOC_BYTES) throw invalid("Document is larger than 256 KB.");
  return text;
}

/** JSON with object keys sorted, for comparing documents regardless of key order. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical((v as any)[k])).join(",") + "}";
  }
  return JSON.stringify(v) ?? "null";
}

/** Deep merge for update(): nested plain objects merge, everything else (arrays, null, scalars) replaces. */
export function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const cur = out[k];
    out[k] = isPlainObject(v) && isPlainObject(cur) ? deepMerge(cur, v) : v;
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
