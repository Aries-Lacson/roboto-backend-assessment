import { createHash } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@workspace/env/server";
import { Logger } from "@workspace/logger";

const logger = new Logger("PublicRateLimit");

const REQUEST_LIMITS = {
  newsletter: 5,
  search: 30,
} as const;

type RateLimitScope = keyof typeof REQUEST_LIMITS;

// There are only two possible scopes, so this map cannot grow with traffic.
const limiters = new Map<RateLimitScope, Ratelimit>();

function getLimiter(scope: RateLimitScope): Ratelimit | null {
  const existing = limiters.get(scope);

  if (existing) {
    return existing;
  }

  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  const limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(REQUEST_LIMITS[scope], "60 s"),
    prefix: `roboto-assessment:${process.env.VERCEL_ENV ?? env.NODE_ENV}:${scope}`,
    analytics: false,
    ephemeralCache: false,

    // Local development crosses regions; production should run near Redis.
    timeout: env.NODE_ENV === "development" ? 10_000 : 2000,
  });

  limiters.set(scope, limiter);
  return limiter;
}

function unavailable(): Response {
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

export async function enforcePublicRateLimit(
  request: Request,
  scope: RateLimitScope,
  requestId: string
): Promise<Response | null> {
  try {
    const limiter = getLimiter(scope);

    if (!limiter) {
      logger.warn("Rate limiter is not configured", { scope, requestId });
      return unavailable();
    }

    // Production assumes Vercel's trusted ingress supplies this header.
    // Local requests without it intentionally share one development bucket.
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "local";

    // Redis stores a stable identifier without storing the raw IP address.
    const identifier = createHash("sha256").update(ip).digest("hex");
    const result = await limiter.limit(identifier);

    // Upstash normally allows requests on timeout. Reject that result so
    // a Redis outage cannot silently disable protection.
    if (result.reason === "timeout") {
      logger.warn("Rate limiter timed out", { scope, requestId });
      return unavailable();
    }

    if (!result.success) {
      const retryAfter = Math.max(
        1,
        Math.ceil((result.reset - Date.now()) / 1000)
      );

      return Response.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(retryAfter),
          },
        }
      );
    }

    return null;
  } catch {
    // Log context without credentials, raw IP addresses, or vendor errors.
    logger.warn("Rate limiter failed", { scope, requestId });
    return unavailable();
  }
}