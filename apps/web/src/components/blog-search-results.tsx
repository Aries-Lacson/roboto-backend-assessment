"use client";

import { cn } from "@workspace/tailwind-config/utils";
import type { ReactNode } from "react";

import { BlogList } from "@/components/blog-list";
import type { Blog } from "@/types";

type BlogSearchResultsProps = Readonly<{
  className?: string;
  results: Blog[];
  isSearching: boolean;
  hasQuery: boolean;
  searchQuery: string;
  error?: Error | null;
  onClear?: () => void;
  page: number;
  totalHits: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}>;

function Term({ children }: Readonly<{ children: string }>) {
  return <span className="text-foreground">“{children}”</span>;
}

function SearchResultsHeader({
  query,
  count,
}: Readonly<{
  query: string;
  count: number;
}>) {
  return (
    <div className="grid gap-1">
      <h2 className="text-balance font-normal text-2xl tracking-tight">
        Search results for <Term>{query}</Term>
      </h2>
      <p className="text-muted-foreground text-sm tabular-nums">
        {count === 0
          ? "No articles found"
          : `${count} article${count === 1 ? "" : "s"} found`}
      </p>
    </div>
  );
}

const STATE_TITLE = "font-medium text-foreground text-lg";

function StateFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="grid h-full place-content-center justify-items-center gap-8 py-16 text-center">
      {children}
    </div>
  );
}

const ACTION_CLASS =
  "focus-ring inline-flex min-h-11 w-max shrink-0 items-center rounded-none border border-foreground px-3 font-mono text-foreground text-sm uppercase tracking-wide transition-colors hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-40";

function EmptySearchState({
  query,
  onClear,
}: Readonly<{
  query: string;
  onClear?: () => void;
}>) {
  return (
    <>
      <div className="grid gap-6">
        <SearchResultsHeader count={0} query={query} />
        <p className="max-w-[70ch] text-pretty text-foreground">
          We couldn&rsquo;t find any articles matching <Term>{query}</Term>.
          Try another term or category.
        </p>
      </div>
      {onClear ? (
        <button className={ACTION_CLASS} onClick={onClear} type="button">
          Clear search
        </button>
      ) : null}
    </>
  );
}

function ErrorState({
  query,
  error,
}: Readonly<{ query: string; error: Error }>) {
  return (
    <div className="grid gap-6">
      <SearchResultsHeader count={0} query={query} />
      <h3 className={cn(STATE_TITLE, "text-destructive")}>Search failed</h3>
      <p role="alert" className="max-w-[70ch] text-pretty text-muted-foreground">
        {error.message}
      </p>
    </div>
  );
}

export function BlogSearchResults({
  className,
  results,
  isSearching,
  hasQuery,
  searchQuery,
  error,
  onClear,
  page,
  totalHits,
  totalPages,
  onPageChange,
}: BlogSearchResultsProps) {
  if (!hasQuery) {
    return null;
  }

  if (isSearching) {
    return (
      <section aria-busy="true" className={cn("mt-8", className)}>
        <output className="block text-muted-foreground">Searching…</output>
      </section>
    );
  }

  if (error || results.length === 0) {
    return (
      <section className={cn("min-h-full", className)}>
        <StateFrame>
          {error ? (
            <ErrorState error={error} query={searchQuery} />
          ) : totalHits > 0 && page > 1 ? (
            <>
              <p>No articles remain on this page.</p>
              <button
                className={ACTION_CLASS}
                onClick={() => onPageChange(1)}
                type="button"
              >
                Back to page 1
              </button>
            </>
          ) : (
            <EmptySearchState onClear={onClear} query={searchQuery} />
          )}
        </StateFrame>
      </section>
    );
  }

  return (
    <section className={cn("mt-8 grid gap-6", className)}>
      <SearchResultsHeader count={totalHits} query={searchQuery} />
      <BlogList blogs={results} />

      {totalPages > 1 ? (
        <nav
          aria-label="Search result pages"
          className="flex flex-wrap items-center gap-3"
        >
          <button
            className={ACTION_CLASS}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            type="button"
          >
            Previous
          </button>

          <span className="text-muted-foreground text-sm tabular-nums">
            Page {page} of {totalPages}
          </span>

          <button
            className={ACTION_CLASS}
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            type="button"
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  );
}