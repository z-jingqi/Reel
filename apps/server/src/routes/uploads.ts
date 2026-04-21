import { Hono } from "hono";

import type { AppEnv } from "../env";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Filenames we'll accept on GET: a uuid-ish stem + an allowed extension.
const FILENAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/;

export const uploadsRouter = new Hono<AppEnv>();

uploadsRouter.post("/", async (c) => {
  const user = c.get("user");
  const form = await c.req.formData();
  const file = form.get("file") as Blob | string | null;
  if (!file || typeof file === "string") {
    return c.json({ error: "missing_file" }, 400);
  }
  const ext = MIME_TO_EXT[file.type];
  if (!ext) {
    return c.json({ error: "unsupported_type", type: file.type }, 400);
  }
  if (file.size > MAX_BYTES) {
    return c.json({ error: "too_large", max: MAX_BYTES }, 413);
  }

  const id = crypto.randomUUID();
  const key = `${user.id}/${id}.${ext}`;
  await c.env.UPLOADS.put(key, file.stream() as ReadableStream, {
    httpMetadata: { contentType: file.type },
  });

  return c.json({ url: `/api/uploads/${key}` }, 201);
});

uploadsRouter.get("/:userId/:filename", async (c) => {
  const user = c.get("user");
  const userId = c.req.param("userId");
  const filename = c.req.param("filename");

  if (userId !== user.id) {
    return c.json({ error: "forbidden" }, 403);
  }
  if (!FILENAME_RE.test(filename)) {
    return c.json({ error: "not_found" }, 404);
  }

  const key = `${userId}/${filename}`;
  const obj = await c.env.UPLOADS.get(key);
  if (!obj) {
    return c.json({ error: "not_found" }, 404);
  }

  return new Response(obj.body as ReadableStream, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "private, max-age=31536000, immutable",
      etag: obj.httpEtag,
    },
  });
});

uploadsRouter.delete("/:userId/:filename", async (c) => {
  const user = c.get("user");
  const userId = c.req.param("userId");
  const filename = c.req.param("filename");
  if (userId !== user.id) return c.json({ error: "forbidden" }, 403);
  if (!FILENAME_RE.test(filename)) return c.json({ error: "not_found" }, 404);
  await c.env.UPLOADS.delete(`${userId}/${filename}`);
  return c.body(null, 204);
});
