# Assessment notes

Production website: https://roboto-backend-assessment-web.vercel.app/
Sanity Studio: https://aries-roboto-assessment.sanity.studio/
Repository: https://github.com/Aries-Lacson/roboto-backend-assessment
Demo video: https://www.loom.com/share/239eacfbe18249d8a37d0479418e5811

Actual working time: approximately 6–7 hours.

## What I built and why

### Newsletter signup

Added a subscriber document containing the email address and subscription
date, together with a public POST endpoint and a working newsletter form.

The endpoint supports JSON and URL-encoded form submissions, validates
input, and normalizes email addresses. A deterministic document ID and
Sanity's createIfNotExists operation prevent duplicate subscriptions,
including concurrent requests.

Rate limiting uses shared Upstash Redis storage: five requests per
60-second sliding window per client identifier. Invalid submissions
also count toward the limit. The endpoint returns 429 when the limit is
exceeded and 503 when the limiter is unavailable.

### Algolia synchronization and search

Added a signed Sanity webhook that synchronizes eligible published blogs
to Algolia. Publishing or editing saves a record using the Sanity document
ID as its objectID. Unpublishing, deleting, or making a document ineligible
removes its record. Draft and unrelated events are ignored, and invalid
signatures are rejected.

Added a repeatable backfill script with index settings defined in code.
It indexes published content without relying on manually configured
dashboard settings.

Replaced public blog search with server-side Algolia search, including
category filtering, pagination, bounded input, and shared rate limiting
of 30 requests per 60-second sliding window. Algolia write credentials
remain server-side.

### Live SEO and index status view

Added a read-only “SEO & Index” view to blog documents in Studio.

The preview reads the displayed document, so title and description changes
appear while typing, before publishing. It includes title and description
length guidance and an image preview with fallbacks.

The view also checks Algolia for the exact published document ID and
reports whether a record is present, missing, or inconsistent with the
document's publication state.

## What I noticed

Published homepage changes initially remained stale because the Sanity
cache-invalidation function had not been deployed. I deployed the existing
Blueprint functions and configured the production site URL and shared
secret. Subsequent published changes appeared on the deployed website.

Algolia indexing is asynchronous. A successful write submission does not
mean the record is immediately searchable. The synchronization and backfill
code wait for Algolia tasks, and the Studio view can refresh its status.

The backfill intentionally upserts eligible records. It does not prune
unrelated or stale records already in an index; removal is handled by
webhook events.

I also changed the navbar to collect contrast measurements before applying
DOM updates, reducing interleaved layout reads and writes.

Mobile PageSpeed results varied between runs. The final captured result
was Performance 88, Accessibility 96, Best Practices 100, and SEO 100.
LCP was 3.8 seconds, CLS was 0, and TBT was 110 milliseconds. There was
insufficient field data to report INP. I do not claim a consistent
performance improvement from these measurements.

The included assessment-dataset.tar.gz contains 51 documents, including
22 blogs and six test subscribers. All subscriber addresses use
example.com.

## What I would improve with more time

- Add automated integration tests for signed webhook deliveries,
  duplicate delivery handling, newsletter concurrency, and pagination.
- Strengthen synchronization against out-of-order webhook events and
  reindex blogs when referenced author information changes.
- Add an explicit reconciliation mode for removing stale Algolia records.
- Measure performance repeatedly under consistent conditions and inspect
  the initial client bundle before making further optimizations.
- Move the Blueprint into a dedicated infrastructure directory, following
  Sanity's recommended monorepo layout.