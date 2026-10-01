import { lucideIconPicker } from "@robotostudio/sanity-plugin-lucide-icon-picker";
import { assist } from "@sanity/assist";
import { visionTool } from "@sanity/vision";
import { defineConfig } from "sanity";
import { presentationTool } from "sanity/presentation";
import { structureTool } from "sanity/structure";
import { unsplashImageAsset } from "sanity-plugin-asset-source-unsplash";
import { media } from "sanity-plugin-media";
import { muxInput } from "sanity-plugin-mux-input";

import { Logo } from "@/components/logo";
import { mainDocuments } from "@/documents";
import { locations } from "@/location";
import { presentationUrl } from "@/plugins/presentation-url";
import { schemaTypes, singletonTypes } from "@/schemaTypes/index";
import { defaultDocumentNode, structure } from "@/structure";
import { getPresentationUrl } from "@/utils/helper";

const projectId = process.env.SANITY_STUDIO_PROJECT_ID ?? "";
const dataset = process.env.SANITY_STUDIO_DATASET ?? "production";
const title = process.env.SANITY_STUDIO_TITLE;

// Singletons and plugin-owned documents are reached through their
// dedicated structure entries or plugins.
const hiddenTemplateIds = new Set([
  ...singletonTypes,
  "assist.instruction.context",
  "media.tag",
  "mux.videoAsset",
]);

export default defineConfig({
  name: "default",
  title,
  icon: Logo,
  projectId,
  dataset,
  releases: {
    enabled: true,
  },
  plugins: [
    presentationTool({
      resolve: {
        locations,
        mainDocuments,
      },
      previewUrl: {
        origin: getPresentationUrl(),
        previewMode: {
          enable: "/api/presentation-draft",
        },
      },
    }),
    structureTool({
      structure,
      defaultDocumentNode,
    }),
    presentationUrl(),
    visionTool(),
    lucideIconPicker(),
    unsplashImageAsset(),
    media(),
    // Defaults: plus video quality, 1080p, public playback.
    // Uploads are billed; configure these options per project.
    muxInput(),
    assist(),
  ],
  document: {
    newDocumentOptions: (prev, { creationContext }) => {
      const { type } = creationContext;

      if (type === "global") {
        return prev.filter(
          (template) => !hiddenTemplateIds.has(template?.templateId)
        );
      }

      return prev;
    },
  },
  form: {
    components: {
      portableText: {
        plugins: (props) =>
          props.renderDefault({
            ...props,
            plugins: {
              ...props.plugins,
              table: { enabled: true },
            },
          }),
      },
    },
  },
  schema: {
    types: schemaTypes,
    templates: [
      {
        id: "nested-page-template",
        title: "Nested Page",
        schemaType: "page",
        value: (props: { slug?: string; title?: string }) => ({
          ...(props.slug
            ? { slug: { current: props.slug, _type: "slug" } }
            : {}),
          ...(props.title ? { title: props.title } : {}),
        }),
        parameters: [
          {
            name: "slug",
            type: "string",
          },
        ],
      },
    ],
  },
});
