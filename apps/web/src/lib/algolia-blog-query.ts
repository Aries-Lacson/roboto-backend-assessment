// Keep this module free of runtime imports so the Node backfill script
// and the Next.js webhook can use the same projection and settings.

const imageFields = /* groq */ `
  "id": asset._ref,
  "preview": asset->metadata.lqip,
  "alt": coalesce(
    alt,
    asset->altText,
    caption,
    asset->originalFilename,
    "untitled"
  ),
  hotspot {
    x,
    y
  },
  crop {
    bottom,
    left,
    right,
    top
  }
`;

export const ALGOLIA_BLOG_PROJECTION = /* groq */ `
  "objectID": _id,
  _id,
  _type,
  title,
  description,
  "slug": slug.current,
  orderRank,
  category,
  publishedAt,
  image {
    ${imageFields}
  },
  authors[0]->{
    _id,
    name,
    position,
    image {
      ${imageFields}
    }
  },
  "author": authors[0]->name,
  "content": pt::text(richText),
  "seoNoIndex": coalesce(seoNoIndex, false),
  "sanityRevision": _rev,
  "sanityUpdatedAt": _updatedAt
`;

export const ALGOLIA_BLOG_FILTER = /* groq */ `
  _type == "blog" &&
  !(_id in path("drafts.**")) &&
  !(_id in path("versions.**")) &&
  defined(slug.current) &&
  seoHideFromLists != true
`;

export const ALGOLIA_ALL_BLOGS_QUERY = /* groq */ `
  *[${ALGOLIA_BLOG_FILTER}] | order(_id asc) {
    ${ALGOLIA_BLOG_PROJECTION}
  }
`;

export const ALGOLIA_SINGLE_BLOG_QUERY = /* groq */ `
  *[_id == $id && ${ALGOLIA_BLOG_FILTER}][0] {
    ${ALGOLIA_BLOG_PROJECTION}
  }
`;

export const ALGOLIA_BLOG_SETTINGS = {
  searchableAttributes: [
    "title",
    "description",
    "content",
    "author",
  ],
  attributesForFaceting: ["filterOnly(category)"],
  hitsPerPage: 10,
  paginationLimitedTo: 1000,
};