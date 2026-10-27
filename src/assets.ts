// Allergen PDFs in R2 (docs/runtime-api.md, `assets`).
import { ApiError, Env, json } from "./http";

const MAX_BYTES = 20 * 1024 * 1024;
const ID_RE = /^[0-9a-f]{32}$/;

function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function uploadAsset(req: Request, env: Env, by: string): Promise<Response> {
  const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/pdf") throw new ApiError(415, "unsupported_type", "Only PDF files can be uploaded.");
  if (Number(req.headers.get("content-length") || 0) > MAX_BYTES) throw new ApiError(413, "too_large", "PDFs can be up to 20 MB.");
  const body = await req.arrayBuffer();
  if (body.byteLength > MAX_BYTES) throw new ApiError(413, "too_large", "PDFs can be up to 20 MB.");
  if (body.byteLength === 0) throw new ApiError(400, "invalid_argument", "The file is empty.");
  const magic = new TextDecoder().decode(new Uint8Array(body, 0, Math.min(1024, body.byteLength)));
  if (!magic.includes("%PDF-")) throw new ApiError(415, "unsupported_type", "That file isn't a PDF.");
  const id = newId();
  await env.FILES.put(id, body, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { by, at: String(Date.now()) },
  });
  return json({ id, url: "/_blob/" + id, sizeBytes: body.byteLength, contentType: "application/pdf" });
}

export async function deleteAsset(env: Env, id: string): Promise<Response> {
  if (!ID_RE.test(id)) return json({ deleted: false });
  const head = await env.FILES.head(id);
  if (head) await env.FILES.delete(id);
  return json({ deleted: !!head });
}

export async function serveBlob(env: Env, id: string): Promise<Response> {
  const obj = ID_RE.test(id) ? await env.FILES.get(id) : null;
  if (!obj) return new Response("Not found", { status: 404, headers: { "x-content-type-options": "nosniff" } });
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType || "application/octet-stream",
      "content-disposition": "inline",
      "content-length": String(obj.size),
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=3600",
      etag: obj.httpEtag,
    },
  });
}
