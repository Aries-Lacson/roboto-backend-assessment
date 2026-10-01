import { Box, Button, Card, Heading, Stack, Text } from "@sanity/ui";
import { useEffect, useState } from "react";
import type { UserViewComponent } from "sanity/structure";

type BlogDocument = {
  _id?: string;
  _rev?: string;
  title?: string;
  description?: string;
  slug?: { current?: string };
  image?: { asset?: { _ref?: string } };
  seoTitle?: string;
  seoDescription?: string;
  seoImage?: { asset?: { _ref?: string } };
  seoNoIndex?: boolean;
  seoHideFromLists?: boolean;
};

type IndexedRecord = {
  objectID: string;
  title?: string | null;
  slug?: string | null;
  sanityRevision?: string;
};

type IndexCheck = {
  key: string;
  status: "loading" | "found" | "missing" | "error";
  record?: IndexedRecord;
  checkedAt?: string;
};

const appId = process.env.SANITY_STUDIO_ALGOLIA_APPLICATION_ID?.trim();
const indexName = process.env.SANITY_STUDIO_ALGOLIA_INDEX_NAME?.trim();
const searchKey = process.env.SANITY_STUDIO_ALGOLIA_SEARCH_API_KEY?.trim();

const configured = Boolean(appId && indexName && searchKey);

const siteUrl =
  process.env.SANITY_STUDIO_SITE_URL?.trim() ||
  process.env.SANITY_STUDIO_PRESENTATION_URL?.trim() ||
  "http://localhost:3000";

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function previewUrl(slug: string): string {
  const path = slug.startsWith("/blog/")
    ? slug
    : `/blog/${slug.replace(/^\/+/, "")}`;

  try {
    const base = new URL(siteUrl);
    if (!["http:", "https:"].includes(base.protocol)) {
      return "Check the Studio site URL configuration";
    }
    return new URL(path, base.origin).href;
  } catch {
    return "Check the Studio site URL configuration";
  }
}

export const SeoIndexView: UserViewComponent = ({ document }) => {
  // Preview follows the currently displayed document as the editor types.
  const displayed = document.displayed as BlogDocument | null;
  const published = document.published as BlogDocument | null;

  const id = clean(published?._id || displayed?._id).replace(/^drafts\./, "");
  const publishedRevision = published?._rev ?? "";
  const checkKey = JSON.stringify([id, publishedRevision]);

  const [refresh, setRefresh] = useState(0);
  const [check, setCheck] = useState<IndexCheck>({
    key: "",
    status: "loading",
  });

  useEffect(() => {
    if (!configured || !id) {
      return;
    }

    let active = true;
    let controller: AbortController | undefined;
    let nextCheck: ReturnType<typeof setTimeout> | undefined;
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;

    setCheck({ key: checkKey, status: "loading" });

    async function checkIndex() {
      controller = new AbortController();
      requestTimeout = setTimeout(() => controller?.abort(), 8000);

      try {
        const endpoint =
          `https://${appId}-dsn.algolia.net/1/indexes/` +
          `${encodeURIComponent(indexName ?? "")}/${encodeURIComponent(id)}`;

        const response = await fetch(endpoint, {
          method: "GET",
          headers: {
            "X-Algolia-Application-Id": appId ?? "",
            "X-Algolia-API-Key": searchKey ?? "",
          },
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.status === 404) {
          if (active) {
            setCheck({
              key: checkKey,
              status: "missing",
              checkedAt: new Date().toLocaleTimeString(),
            });
          }
          return;
        }

        if (!response.ok) {
          throw new Error("Index check failed");
        }

        const record = (await response.json()) as IndexedRecord;

        if (record.objectID !== id) {
          throw new Error("Unexpected index record");
        }

        if (active) {
          setCheck({
            key: checkKey,
            status: "found",
            record,
            checkedAt: new Date().toLocaleTimeString(),
          });
        }
      } catch {
        if (active) {
          setCheck({ key: checkKey, status: "error" });
        }
      } finally {
        clearTimeout(requestTimeout);

        // Poll while this view is open to reflect webhook completion.
        if (active) {
          nextCheck = setTimeout(() => {
            void checkIndex();
          }, 10_000);
        }
      }
    }

    void checkIndex();

    return () => {
      active = false;
      clearTimeout(nextCheck);
      clearTimeout(requestTimeout);
      controller?.abort();
    };
  }, [id, checkKey, refresh]);

  const titleOverride = clean(displayed?.seoTitle);
  const descriptionOverride = clean(displayed?.seoDescription);

  const title = titleOverride || clean(displayed?.title);
  const description = descriptionOverride || clean(displayed?.description);

  const titleSource = titleOverride ? "SEO override" : "post title";
  const descriptionSource = descriptionOverride
    ? "SEO override"
    : "post description";

  const imageOverride = displayed?.seoImage?.asset?._ref;
  const imageRef = imageOverride || displayed?.image?.asset?._ref;
  const imageSource = imageOverride ? "SEO override" : "post image";

  const slug = clean(displayed?.slug?.current);
  const url = slug ? previewUrl(slug) : "Add a URL slug";

  const descriptionPreview =
    description.length > 160 ? `${description.slice(0, 157)}…` : description;

  const currentCheck: IndexCheck =
    check.key === checkKey ? check : { key: checkKey, status: "loading" };

  const indexed = currentCheck.status === "found";
  const publishedSlug = clean(published?.slug?.current);
  const shouldBeIndexed = Boolean(
    published && publishedSlug && published.seoHideFromLists !== true
  );

  let indexMessage: string;

  if (!configured) {
    indexMessage = "Algolia search-only configuration is missing.";
  } else if (!id) {
    indexMessage = "Save the document before checking Algolia.";
  } else if (currentCheck.status === "loading") {
    indexMessage = "Checking Algolia…";
  } else if (currentCheck.status === "error") {
    indexMessage =
      "Could not check Algolia. Its indexing status is unknown. Try again.";
  } else if (!indexed) {
    indexMessage = shouldBeIndexed
      ? "⚠ Published post is missing from Algolia."
      : "✓ Post is absent from Algolia, as expected.";
  } else if (!published) {
    indexMessage = "⚠ Unpublished post is unexpectedly present in Algolia.";
  } else if (!shouldBeIndexed) {
    indexMessage =
      "⚠ Published post is hidden or has no slug, but remains in Algolia.";
  } else if (published.seoNoIndex === true) {
    indexMessage = "⚠ Published post has SEO noindex set, but is in Algolia.";
  } else if (
    currentCheck.record?.title !== published.title ||
    currentCheck.record?.slug !== publishedSlug ||
    (currentCheck.record?.sanityRevision &&
      currentCheck.record.sanityRevision !== publishedRevision)
  ) {
    indexMessage =
      "⚠ Algolia differs from the published document. The webhook may still be processing.";
  } else {
    indexMessage = "✓ Published post is present in Algolia.";
  }

  return (
    <Box padding={4}>
      <Stack style={{ gap: 24 }}>
        <Stack style={{ gap: 12 }}>
          <Heading size={1}>Search preview</Heading>

          <Card border padding={3} radius={2}>
            <Stack style={{ gap: 12 }}>
              <Text size={1} muted style={{ overflowWrap: "anywhere" }}>
                {url}
              </Text>
              <Text size={2} weight="semibold">
                {title || "Add a title"}
              </Text>
              <Text size={1}>{descriptionPreview || "Add a description"}</Text>
            </Stack>
          </Card>

          <Text size={1} muted>
            Preview follows the displayed document, including unpublished edits.
          </Text>
        </Stack>

        <Stack style={{ gap: 12 }}>
          <Heading size={1}>Checks</Heading>

          <Text size={1}>
            {title ? "✓" : "⚠"} Meta title: {title.length} characters (
            {titleSource})
          </Text>

          <Text size={1}>
            {description.length >= 140 && description.length <= 160 ? "✓" : "⚠"}{" "}
            Description: {description.length} characters; target 140–160 (
            {descriptionSource})
          </Text>

          <Text size={1}>
            {slug ? "✓ URL slug is set" : "⚠ URL slug is missing"}
          </Text>

          <Text size={1}>
            {imageRef
              ? `✓ Image is set (${imageSource})`
              : "⚠ Image is missing"}
          </Text>

          <Text size={1}>
            {displayed?.seoNoIndex
              ? "⚠ Search engine indexing is disabled (SEO noindex)"
              : "✓ Search engine indexing is allowed"}
          </Text>

          <Text size={1}>
            {displayed?.seoHideFromLists
              ? "⚠ Hidden from list pages and Algolia after publishing"
              : "✓ Visible in list pages"}
          </Text>
        </Stack>

        <Stack style={{ gap: 12 }}>
          <Heading size={1}>Search index</Heading>

          <div aria-live="polite">
            <Text size={1}>{indexMessage}</Text>
          </div>

          {indexed &&
          displayed?.seoNoIndex === true &&
          published?.seoNoIndex !== true ? (
            <Text size={1}>
              ⚠ The displayed draft has SEO noindex set. The published post is
              currently in Algolia.
            </Text>
          ) : null}

          <Text size={1} muted>
            Index checks compare the published document. Draft edits are not
            expected to update Algolia until published.
          </Text>

          <Text size={1} muted style={{ overflowWrap: "anywhere" }}>
            Algolia object ID: {id || "Not available"}
          </Text>

          {currentCheck.checkedAt ? (
            <Text size={1} muted>
              Last checked: {currentCheck.checkedAt}. Refreshes every 10
              seconds.
            </Text>
          ) : null}

          <Button
            text="Check again"
            mode="ghost"
            disabled={!configured || !id}
            onClick={() => setRefresh((value) => value + 1)}
          />
        </Stack>
      </Stack>
    </Box>
  );
};
