import { createHash, randomUUID } from "node:crypto";
import { env } from "@workspace/env/server";
import { Logger } from "@workspace/logger";
import { client } from "@workspace/sanity/client";

import { enforcePublicRateLimit } from "@/lib/public-rate-limit";

const logger = new Logger("Newsletter");

const MAX_BODY_BYTES = 2048;
const BODY_TIMEOUT_MS = 10_000;
const MAX_EMAIL_LENGTH = 254;

class InputError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readBoundedBody(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    const length = Number(contentLength);

    if (!Number.isSafeInteger(length) || length < 0) {
      throw new InputError(400, "Invalid request");
    }

    if (length > MAX_BODY_BYTES) {
      throw new InputError(413, "Request body is too large");
    }
  }

  if (!request.body) {
    throw new InputError(400, "Email is required");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;

  // Bound both bytes and time, including requests without Content-Length.
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, BODY_TIMEOUT_MS);

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (timedOut) {
        throw new InputError(408, "Request timed out");
      }

      if (done) {
        break;
      }

      size += value.byteLength;

      if (size > MAX_BODY_BYTES) {
        throw new InputError(413, "Request body is too large");
      }

      chunks.push(value);
    }

    const bytes = new Uint8Array(size);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function readEmail(request: Request): Promise<string> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();

  if (
    contentType !== "application/json" &&
    contentType !== "application/x-www-form-urlencoded"
  ) {
    throw new InputError(415, "Unsupported content type");
  }

  let value: unknown;

  try {
    const body = await readBoundedBody(request);

    if (contentType === "application/json") {
      const parsed: unknown = JSON.parse(body);

      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        throw new InputError(400, "Invalid request");
      }

      value = (parsed as Record<string, unknown>).email;
    } else {
      // A normal browser form sends URL-encoded fields, not JSON.
      const values = new URLSearchParams(body).getAll("email");

      if (values.length !== 1) {
        throw new InputError(400, "Provide one email address");
      }

      value = values[0];
    }
  } catch (error) {
    if (error instanceof InputError) {
      throw error;
    }

    throw new InputError(400, "Invalid request");
  }

  if (typeof value !== "string") {
    throw new InputError(400, "A valid email address is required");
  }

  const email = value.trim().toLowerCase();
  const parts = email.split("@");
  const local = parts[0];
  const domain = parts[1];

  // Accept common mailbox addresses; delivery verification is out of scope.
  if (
    email.length > MAX_EMAIL_LENGTH ||
    parts.length !== 2 ||
    !local ||
    local.length > 64 ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) ||
    !domain ||
    !domain.includes(".") ||
    !domain.split(".").every(
      (label) =>
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
    )
  ) {
    throw new InputError(400, "A valid email address is required");
  }

  return email;
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  // Invalid input also consumes the limit, protecting parsing and writes.
  const limited = await enforcePublicRateLimit(
    request,
    "newsletter",
    requestId
  );

  if (limited) {
    return limited;
  }

  let email: string;

  try {
    email = await readEmail(request);
  } catch (error) {
    if (error instanceof InputError) {
      return json({ error: error.message }, error.status);
    }

    return json({ error: "Invalid request" }, 400);
  }

  try {
    const writeClient = client.withConfig({
      token: env.SANITY_API_WRITE_TOKEN,
      useCdn: false,
      stega: { enabled: false },
      timeout: 10_000,
      maxRetries: 0,
    });

    const emailHash = createHash("sha256").update(email).digest("hex");

    // A deterministic ID makes concurrent and repeated submissions safe.
    // createIfNotExists preserves the original subscription timestamp.
    await writeClient.createIfNotExists({
      _id: `subscriber.${emailHash}`,
      _type: "subscriber",
      email,
      subscribedAt: new Date().toISOString(),
    });

    logger.info("Subscription accepted", { requestId });

    // Identical responses avoid disclosing whether an address already exists.
    return json({ success: true });
  } catch {
    logger.warn("Subscription write failed", { requestId });

    return json({ error: "Service temporarily unavailable" }, 503);
  }
}