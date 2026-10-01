import { randomUUID } from "node:crypto";
import { env } from "@workspace/env/server";
import { Logger } from "@workspace/logger";
import { client } from "@workspace/sanity/client";
import { algoliasearch } from "algoliasearch";
import { NextRequest } from "next/server";
import { parseBody } from "next-sanity/webhook";

import { ALGOLIA_SINGLE_BLOG_QUERY } from "@/lib/algolia-blog-query";
import {
  type AlgoliaBlogRecord,
  prepareAlgoliaBlog,
} from "@/lib/algolia-blog-record";

const logger = new Logger("AlgoliaSync");
const MAX_BODY_BYTES = 8192;

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Bound the actual body, including requests without Content-Length.
// Preserve its bytes so signature validation sees the original payload.
async function boundedRequest(request: NextRequest) {
  if (!request.body) {
    throw new Error("Missing body");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 10_000);

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (timedOut) {
        throw new Error("Body timeout");
      }

      if (done) {
        break;
      }

      size += value.byteLength;

      if (size > MAX_BODY_BYTES) {
        throw new Error("Body too large");
      }

      chunks.push(value);
    }

    const bytes = new Uint8Array(size);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);

    return new NextRequest(request.url, {
      method: "POST",
      headers: request.headers,
      body,
    });
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const secret = env.SANITY_ALGOLIA_WEBHOOK_SECRET;

  // Fail closed before reading or processing an unsigned request.
  if (!secret || !request.headers.get("sanity-webhook-signature")) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: unknown;

  try {
    const bounded = await boundedRequest(request);
    const parsed = await parseBody<unknown>(bounded, secret, true);

    if (!parsed.isValidSignature) {
      return json({ error: "Unauthorized" }, 401);
    }

    body = parsed.body;
  } catch {
    logger.warn("Rejected invalid webhook request", { requestId });
    return json({ error: "Invalid webhook request" }, 400);
  }

  if (!isObject(body)) {
    return json({ error: "Invalid webhook payload" }, 400);
  }

  // These source values will be included in the signed projection.
  const config = client.config();

  if (
    body.projectId !== config.projectId ||
    body.dataset !== config.dataset
  ) {
    return json({ error: "Invalid document source" }, 400);
  }

  if (body._type !== "blog") {
    return json({ ignored: true });
  }

  const id = body._id;

  if (
    typeof id !== "string" ||
    id.length > 128 ||
    !/^[a-zA-Z0-9_.-]+$/.test(id)
  ) {
    return json({ error: "Invalid document ID" }, 400);
  }

  if (id.startsWith("drafts.") || id.startsWith("versions.")) {
    return json({ ignored: true });
  }

  const appId = env.ALGOLIA_APPLICATION_ID;
  const apiKey = env.ALGOLIA_WRITE_API_KEY;
  const indexName = env.ALGOLIA_INDEX_NAME;

  if (!appId || !apiKey || !indexName) {
    logger.warn("Indexing is not configured", { requestId });
    return json({ error: "Service temporarily unavailable" }, 503);
  }

  try {
    const publishedClient = client.withConfig({
      perspective: "published",
      useCdn: false,
      token: env.SANITY_API_READ_TOKEN,
      stega: { enabled: false },
      timeout: 10_000,
      maxRetries: 0,
    });

    // Read current state instead of indexing potentially stale event data.
    const blog = await publishedClient.fetch<AlgoliaBlogRecord | null>(
      ALGOLIA_SINGLE_BLOG_QUERY,
      { id },
      { cache: "no-store" }
    );

    const algolia = algoliasearch(appId, apiKey);

    const result = blog
      ? await algolia.saveObject({
          indexName,
          body: prepareAlgoliaBlog(blog),
        })
      : await algolia.deleteObject({
          indexName,
          objectID: id,
        });

    logger.info("Index operation queued", {
      requestId,
      id,
      taskID: result.taskID,
      operation: blog ? "save" : "delete",
    });

    // Bound polling. Return success only after Algolia confirms completion.
    // A timeout returns 503 so Sanity can retry the idempotent operation.
    await algolia.waitForTask({
      indexName,
      taskID: result.taskID,
      maxRetries: 10,
      timeout: () => 500,
    });

    return json({
      success: true,
      operation: blog ? "saved" : "deleted",
      taskID: result.taskID,
    });
  } catch {
    logger.warn("Index synchronization failed", { requestId, id });

    return Response.json(
      { error: "Service temporarily unavailable" },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "5",
        },
      }
    );
  }
}