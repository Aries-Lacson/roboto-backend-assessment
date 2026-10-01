import { createClient } from "@sanity/client";
import { algoliasearch } from "algoliasearch";

import {
  ALGOLIA_BLOG_FILTER,
  ALGOLIA_BLOG_PROJECTION,
  ALGOLIA_BLOG_SETTINGS,
} from "../src/lib/algolia-blog-query.ts";
import { prepareAlgoliaBlog } from "../src/lib/algolia-blog-record.ts";

const required = [
  "NEXT_PUBLIC_SANITY_PROJECT_ID",
  "NEXT_PUBLIC_SANITY_DATASET",
  "SANITY_API_READ_TOKEN",
  "ALGOLIA_APPLICATION_ID",
  "ALGOLIA_INDEX_NAME",
  "ALGOLIA_WRITE_API_KEY",
];

for (const name of required) {
  if (!process.env[name]?.trim()) {
    throw new Error(`Missing environment variable: ${name}`);
  }
}

const indexName = process.env.ALGOLIA_INDEX_NAME;

const sanity = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  apiVersion:
    process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-02-19",
  token: process.env.SANITY_API_READ_TOKEN,
  perspective: "published",
  useCdn: false,
  timeout: 15_000,
  maxRetries: 0,
});

const algolia = algoliasearch(
  process.env.ALGOLIA_APPLICATION_ID,
  process.env.ALGOLIA_WRITE_API_KEY
);

const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const MAX_RECORD_BYTES = 10_000;

const pageQuery = /* groq */ `
  *[${ALGOLIA_BLOG_FILTER} && _id > $after]
    | order(_id asc)
    [0...${PAGE_SIZE}] {
      ${ALGOLIA_BLOG_PROJECTION}
    }
`;

async function waitForTask(taskID) {
  await algolia.waitForTask({
    indexName,
    taskID,
    maxRetries: 60,
    timeout: () => 500,
  });
}

let stage = "loading published blogs";

// Bound the entire CLI run, including network retries.
// A timeout may leave already queued operations running in Algolia.
const deadline = setTimeout(() => {
  console.error(
    `Backfill timed out during ${stage}. Check Algolia task status before retrying.`
  );
  process.exit(1);
}, 120_000);

try {
  const records = [];
  let after = "";
  let complete = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const blogs = await sanity.fetch(pageQuery, { after });

    if (!Array.isArray(blogs)) {
      throw new Error("Unexpected query result");
    }

    for (const blog of blogs) {
      if (
        typeof blog.objectID !== "string" ||
        blog.objectID !== blog._id ||
        blog.objectID.startsWith("drafts.") ||
        blog.objectID.startsWith("versions.")
      ) {
        throw new Error("Invalid published record");
      }

      const record = prepareAlgoliaBlog(blog);
      const bytes = Buffer.byteLength(JSON.stringify(record), "utf8");

      if (bytes > MAX_RECORD_BYTES) {
        console.error(
          `Record ${record.objectID} exceeds ${MAX_RECORD_BYTES} bytes.`
        );
        throw new Error("Record too large");
      }

      records.push(record);
    }

    if (blogs.length < PAGE_SIZE) {
      complete = true;
      break;
    }

    after = blogs[blogs.length - 1]._id;
  }

  if (!complete) {
    throw new Error("Backfill page limit reached");
  }

  if (records.length === 0) {
    throw new Error("No eligible published blogs");
  }

  console.log(`Loaded ${records.length} eligible published blogs.`);

  stage = "applying index settings";

  const settings = await algolia.setSettings({
    indexName,
    indexSettings: ALGOLIA_BLOG_SETTINGS,
  });

  console.log(`Settings task: ${settings.taskID}`);
  await waitForTask(settings.taskID);

  stage = "saving blog records";

  const tasks = await algolia.saveObjects({
    indexName,
    objects: records,
    batchSize: PAGE_SIZE,
    waitForTasks: false,
  });

  stage = "waiting for record tasks";

  for (const task of tasks) {
    console.log(`Records task: ${task.taskID}`);
    await waitForTask(task.taskID);
  }

  console.log(
    `Completed: ${records.length} published blogs indexed in ${indexName}.`
  );
} catch (error) {
  // Avoid printing SDK errors that could include request credentials.
  const status =
    error && typeof error === "object" &&
    typeof error.statusCode === "number"
      ? ` HTTP ${error.statusCode}.`
      : "";

  console.error(`Backfill failed during ${stage}.${status}`);
  console.error(
    "Check credentials, key permissions, record sizes, and Algolia task status."
  );

  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
}