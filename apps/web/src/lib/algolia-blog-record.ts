import type { Blog } from "@/types";

export type AlgoliaBlogRecord = Blog & {
  objectID: string;
  author: string | null;
  content: string | null;
  seoNoIndex: boolean;
  sanityRevision: string;
  sanityUpdatedAt: string;
};

// Limit searchable body text to leave room for card fields within
// Algolia's record size limit. Use this in both indexing paths.
export function prepareAlgoliaBlog<T extends { content?: string | null }>(
  record: T
) {
  return {
    ...record,
    content: (record.content ?? "").slice(0, 1500),
  };
}