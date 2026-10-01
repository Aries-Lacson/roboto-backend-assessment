"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useDebounce } from "@/hooks/use-debounce";
import type { Blog } from "@/types";

const SEARCH_DEBOUNCE_MS = 400;
const CACHE_STALE_TIME_MS = 30_000;
const MAX_PAGE = 100;

type BlogSearchResponse = {
  results: Blog[];
  page: number;
  totalHits: number;
  totalPages: number;
  hitsPerPage: number;
};

async function searchBlog(
  query: string,
  category: string,
  page: number,
  signal: AbortSignal
): Promise<BlogSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    page: String(page),
  });

  if (category) {
    params.set("category", category);
  }

  const response = await fetch(`/api/blog/search?${params}`, {
    signal,
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After"));

      throw new Error(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? `Too many searches. Try again in ${Math.ceil(retryAfter)} seconds.`
          : "Too many searches. Please try again shortly."
      );
    }

    if (response.status === 400) {
      throw new Error("Check your search query and selected category.");
    }

    throw new Error("Search is temporarily unavailable. Please try again.");
  }

  return response.json() as Promise<BlogSearchResponse>;
}

export function useBlogSearch(category = "") {
  const [searchQuery, updateSearchQuery] = useState("");
  const query = searchQuery.trim();
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const searchKey = JSON.stringify([debouncedQuery, category]);

  const [pagination, setPagination] = useState({
    searchKey,
    page: 1,
  });

  // A changed query or category immediately uses page 1.
  const page = pagination.searchKey === searchKey ? pagination.page : 1;

  useEffect(() => {
    setPagination((current) =>
      current.searchKey === searchKey
        ? current
        : { searchKey, page: 1 }
    );
  }, [searchKey]);

  const hasQuery = query.length > 0;
  const isDebouncing = query !== debouncedQuery;

  const { data, isFetching, error } = useQuery({
    queryKey: ["blog-search", debouncedQuery, category, page],
    queryFn: ({ signal }) =>
      searchBlog(debouncedQuery, category, page, signal),
    enabled: hasQuery && !isDebouncing,
    staleTime: CACHE_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });

  function setSearchQuery(value: string) {
    updateSearchQuery(value);
    setPagination({ searchKey, page: 1 });
  }

  function setPage(nextPage: number) {
    const lastPage = Math.min(data?.totalPages ?? 1, MAX_PAGE);

    if (
      !Number.isInteger(nextPage) ||
      nextPage < 1 ||
      nextPage > lastPage
    ) {
      return;
    }

    setPagination({ searchKey, page: nextPage });
  }

  const visibleData = hasQuery && !isDebouncing ? data : undefined;

  return {
    searchQuery,
    setSearchQuery,
    results: visibleData?.results ?? [],
    totalHits: visibleData?.totalHits ?? 0,
    totalPages: visibleData?.totalPages ?? 0,
    page,
    setPage,
    isSearching: hasQuery && (isDebouncing || isFetching),
    error: hasQuery && !isDebouncing ? error : null,
    hasQuery,
  };
}