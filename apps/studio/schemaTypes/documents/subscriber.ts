import { defineField, defineType } from "sanity";

export const subscriber = defineType({
  name: "subscriber",
  title: "Subscriber",
  type: "document",
  fields: [
    defineField({
      name: "email",
      title: "Email",
      type: "string",
      description: "The normalized email address submitted through the website.",
      readOnly: true,
      validation: (rule) => rule.required().email(),
    }),
    defineField({
      name: "subscribedAt",
      title: "Subscribed at",
      type: "datetime",
      description: "When this address first subscribed.",
      readOnly: true,
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: {
      title: "email",
      subtitle: "subscribedAt",
    },
  },
});