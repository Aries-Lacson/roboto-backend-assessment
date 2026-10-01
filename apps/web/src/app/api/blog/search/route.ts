import { randomUUID } from "node:crypto";
import { env } from "@workspace/env/server";
import { Logger } from "@workspace/logger";
import {
  type DynamicFetchOptions,
  getDynamicFetchOptions,
  sanityFetch,
} from "@workspace/sanity/live";
import { queryAllBlogDataForSearch } from "@workspace/sanity/query";
import { algoliasearch } from "algoliasearch";
import Fuse from "fuse.js";
import { NextResponse } from "next/server";

import { BLOG_CATEGORIES } from "@/lib/blog-categories";
import { enforcePublicRateLimit } from "@/lib/public-rate-limit";
import type { Blog } from "@/types";

const logger = new Logger("BlogSearch");

const HITS_PER_PAGE = 10;
const MAX_PAGE = 100;
const MAX_QUERY_LENGTH = 200;

const allowedCategories = new Set<string>(
  BLOG_CATEGORIES.map(({ value }) => value)
);

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function getSearchableBlogs(
  perspective: DynamicFetchOptions["perspective"]
) {
  "use cache";

  const { data } = await sanityFetch({
    query: queryAllBlogDataForSearch,
    perspective,
    stega: false,
  });

  return data;
}

// Return only the fields consumed by the existing blog cards.
function toBlog(record: Blog): Blog {
  return {
    _id: record._id,
    _type: record._type,
    title: record.title,
    description: record.description,
    slug: record.slug,
    orderRank: record.orderRank,
    category: record.category,
    image: record.image,
    publishedAt: record.publishedAt,
    authors: record.authors,
  };
}

export async function GET(request: Request) {
  const requestId = randomUUID();

  const limited = await enforcePublicRateLimit(
    request,
    "search",
    requestId
  );

  if (limited) {
    return limited;
  }

  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q") ?? "";
  const query = rawQuery.trim();
  const rawPage = searchParams.get("page") ?? "1";
  const category = searchParams.get("category") ?? "";

  if (!query || rawQuery.length > MAX_QUERY_LENGTH) {
    return json(
      { error: "Query must contain between 1 and 200 characters" },
      400
    );
  }

  if (!/^[1-9]\d{0,2}$/.test(rawPage)) {
    return json({ error: "Invalid page" }, 400);
  }

  const page = Number(rawPage);

  if (page > MAX_PAGE) {
    return json({ error: "Page must be between 1 and 100" }, 400);
  }

  if (category && !allowedCategories.has(category)) {
    return json({ error: "Invalid category" }, 400);
  }

  try {
    const { perspective } = await getDynamicFetchOptions();

    if (perspective === "published") {
      const appId = env.ALGOLIA_APPLICATION_ID;
      const indexName = env.ALGOLIA_INDEX_NAME;
      const searchKey = env.ALGOLIA_SEARCH_API_KEY;

      if (!appId || !indexName || !searchKey) {
        logger.warn("Search is not configured", { requestId });

        return json({ error: "Search temporarily unavailable" }, 503);
      }

      const algolia = algoliasearch(appId, searchKey);

      const response = await algolia.searchSingleIndex<Blog>({
        indexName,
        searchParams: {
          query,
          page: page - 1,
          hitsPerPage: HITS_PER_PAGE,
          facetFilters: category ? [`category:${category}`] : [],
          attributesToRetrieve: [
            "_id",
            "_type",
            "title",
            "description",
            "slug",
            "orderRank",
            "category",
            "image",
            "publishedAt",
            "authors",
          ],
          attributesToHighlight: [],
          attributesToSnippet: [],
        },
      });

      return json({
        results: response.hits.map(toBlog),
        page,
        totalHits: response.nbHits ?? 0,
        totalPages: Math.min(response.nbPages ?? 0, MAX_PAGE),
        hitsPerPage: HITS_PER_PAGE,
      });
    }

    // Preserve the starter's draft-preview behavior.
    const data = (await getSearchableBlogs(perspective)) ?? [];
    const filtered = category
      ? data.filter((blog) => blog.category === category)
      : data;

    const fuse = new Fuse(filtered, {
      keys: ["title", "description", "slug", "authors.name"],
      threshold: 0.3,
    });

    const matches = fuse.search(query);
    const start = (page - 1) * HITS_PER_PAGE;

    return json({
      results: matches
        .slice(start, start + HITS_PER_PAGE)
        .map(({ item }) => toBlog(item)),
      page,
      totalHits: matches.length,
      totalPages: Math.min(
        Math.ceil(matches.length / HITS_PER_PAGE),
        MAX_PAGE
      ),
      hitsPerPage: HITS_PER_PAGE,
    });
  } catch {
    logger.warn("Search request failed", { requestId });

    return json({ error: "Search temporarily unavailable" }, 503);
  }
}