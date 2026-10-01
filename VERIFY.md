# Verification

Website: https://roboto-backend-assessment-web.vercel.app/
Studio: https://aries-roboto-assessment.sanity.studio/
Video: https://www.loom.com/share/239eacfbe18249d8a37d0479418e5811

Sanity project: 94fzyk58
Dataset: production
Algolia application: 7XETUH8KRL
Algolia index: blog_posts_assessment

Test blog ID:
d1584f24-b433-4c90-9e4d-c6a6b4ab5292

## 1. Publishing creates or updates an Algolia record

Published the test blog from Studio and inspected the actual Sanity
webhook delivery log.

Observed delivery on 2026-10-01 at 11:56:09.743 UTC:

- HTTP 200
- success: true
- operation: saved
- Algolia taskID: 415353908

Edited and published the same blog again.

Observed delivery at 11:59:23.441 UTC:

- HTTP 200
- operation: saved
- Algolia taskID: 415573874

Confirmed the updated record in Algolia using the exact Sanity document ID
as objectID.

## 2. Unpublishing removes the Algolia record

Unpublished the test blog from Studio.

Observed delivery on 2026-10-01 at 12:05:23.138 UTC:

- HTTP 200
- operation: deleted
- Algolia taskID: 415928747

Confirmed the record was absent from Algolia. Republishing restored it.

The video also demonstrates unpublishing, checking absence, and
republishing to restore the record.

## 3. Draft changes do not enter public search

Changed the draft title to AriesDraftOnlyVerification without publishing.

Confirmed that the draft-only title did not appear in public search.
The public Algolia record retained the published content.

Restored the test content afterward.

## 4. Identical signed requests do not create duplicate records

Executed a locally signed replay against the production endpoint.
This was a terminal replay, separate from Sanity's own delivery logs.

The script loaded credentials locally using:

```bash
cd apps/web
node --env-file=.env --input-type=module
```

It signed this payload once with encodeSignatureHeader from
@sanity/webhook and sent the identical body and signature twice:

```json
{
  "_id": "d1584f24-b433-4c90-9e4d-c6a6b4ab5292",
  "_type": "blog",
  "projectId": "94fzyk58",
  "dataset": "production"
}
```

Recorded output:

```text
Before: {"totalRecords":22,"matchingRecords":1}
{"attempt":1,"status":200,"success":true,"operation":"saved","taskID":427851767}
{"attempt":2,"status":200,"success":true,"operation":"saved","taskID":427852145}
After: {"totalRecords":22,"matchingRecords":1}
PASS: identical signed request delivered twice; one record remains.
```

Both operations completed successfully. The total record count remained
22, and the exact objectID still matched one record.

A separate actual Sanity delivery log also showed a failed 503 attempt
followed by a successful 200 attempt for the same message, demonstrating
retry recovery.

## 5. Public search returns page 2

Command:

```bash
curl -i --max-time 30 \
  'https://roboto-backend-assessment-web.vercel.app/api/blog/search?q=a&page=2'
```

Observed:

- HTTP 200
- Cache-Control: no-store
- page: 2
- totalHits: 22
- totalPages: 3
- hitsPerPage: 10
- 10 returned results with 10 distinct document IDs

Also manually checked search, category filtering, Previous/Next
pagination, and clearing the query in the deployed website.

## 6. Unsigned synchronization requests are rejected

Command:

```bash
curl -i --max-time 30 \
  -X POST https://roboto-backend-assessment-web.vercel.app/api/algolia-sync \
  -H 'Content-Type: application/json' \
  -d '{"_id":"assessment-auth-test","_type":"blog","projectId":"94fzyk58","dataset":"production"}'
```

Recorded response:

```text
HTTP/2 401
```

```json
{"error":"Unauthorized"}
```

No webhook signature was supplied.

## 7. SEO preview updates before publishing

Opened the test blog's SEO & Index view in deployed Studio.

Changed the title and description without publishing and confirmed:

- The preview updated while typing.
- Character counts updated with the displayed draft.
- Description length guidance changed when exceeding the recommended range.

The demonstration video is 2 minutes 37 seconds and includes these
changes before publishing.

## 8. Studio reports actual Algolia presence and absence

Checked the exact test blog ID in the SEO & Index view.

Confirmed:

- Published and indexed: record present.
- Unpublished and removed: record absent.
- Republished: record present again.

The video demonstrates all three states, including republishing at the end.

## Newsletter verification

### JSON submission

Command:

```bash
curl -i --max-time 120 \
  -X POST http://localhost:3000/api/newsletter \
  -H 'Content-Type: application/json' \
  -d '{"email":"aries-assessment-test@example.com"}'
```

Recorded response:

```text
HTTP/1.1 200 OK
```

```json
{"success":true}
```

### URL-encoded submission

Command:

```bash
curl -i --max-time 30 \
  -X POST http://localhost:3000/api/newsletter \
  --data-urlencode 'email=aries-assessment-test@example.com'
```

Recorded response:

```text
HTTP/1.1 200 OK
```

```json
{"success":true}
```

Confirmed that repeated subscription with the same email left one
subscriber document. Also manually submitted the deployed browser form
and confirmed its success state.

### Validation and rate limiting

Command:

```bash
for n in 1 2 3 4 5 6; do
  curl -sS --max-time 30 \
    -o /dev/null \
    -w "attempt $n: %{http_code}\n" \
    -X POST http://localhost:3000/api/newsletter \
    -H 'Content-Type: application/json' \
    -d '{"email":"not-an-email"}'
done
```

Recorded output:

```text
attempt 1: 400
attempt 2: 400
attempt 3: 400
attempt 4: 400
attempt 5: 400
attempt 6: 429
```

The invalid submissions count toward the five-request limit.

## Backfill verification

Command:

```bash
cd apps/web
node --env-file=.env scripts/backfill-algolia.mjs
```

Recorded successful output:

```text
Loaded 22 eligible published blogs.
Settings task: 421302846
Records task: 421304873
Completed: 22 published blogs indexed in blog_posts_assessment.
```

The script uses stable objectIDs and applies the index settings from code.

## Type checks and builds

Successfully ran:

```bash
corepack pnpm@11.24.0 --filter studio check-types
corepack pnpm@11.24.0 --filter web check-types
corepack pnpm@11.24.0 --filter studio build
corepack pnpm@11.24.0 --filter web build
git diff --check
```

Studio schema extraction and type generation also completed successfully.

The web production build compiled successfully and generated 47 pages.
It emitted two rate-limiter warnings during prerendering; these are
recorded here rather than treating the build as warning-free.

## Dataset export

Included assessment-dataset.tar.gz in the repository.

Inspected the exported NDJSON documents:

```text
author: 3
blog: 22
blogIndex: 1
faq: 7
footer: 1
homePage: 1
navbar: 1
page: 8
settings: 1
subscriber: 6
Subscribers outside example.com: 0
```

Total: 51 documents. All six subscriber addresses are test addresses
under example.com.