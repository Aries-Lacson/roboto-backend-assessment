import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import { z } from "zod/v4";

const env = createEnv({
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },

  server: {
    SANITY_API_READ_TOKEN: z.string().min(1),
    SANITY_API_WRITE_TOKEN: z.string().min(1),

    SANITY_REVALIDATE_SECRET: z.string().min(1).optional(),

    SANITY_CONTEXT_ENDPOINT: z.url().optional(),
    SANITY_CONTEXT_TOKEN: z.string().min(1).optional(),

    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

    ALGOLIA_APPLICATION_ID: z.string().min(1).optional(),
    ALGOLIA_INDEX_NAME: z.string().min(1).optional(),
    ALGOLIA_SEARCH_API_KEY: z.string().min(1).optional(),
    ALGOLIA_WRITE_API_KEY: z.string().min(1).optional(),
    SANITY_ALGOLIA_WEBHOOK_SECRET: z.string().min(1).optional(),
  },

  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
  },

  emptyStringAsUndefined: true,

  extends: [vercel()],
});

export { env };