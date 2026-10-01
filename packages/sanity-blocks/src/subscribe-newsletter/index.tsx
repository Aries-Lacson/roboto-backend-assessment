"use client";

import { BlockEyebrow } from "@workspace/sanity-blocks/internal/block-eyebrow";
import type { RichTextValue } from "@workspace/sanity-blocks/internal/rich-text";
import { RichText } from "@workspace/sanity-blocks/internal/rich-text";
import type { SanityImageData } from "@workspace/sanity-blocks/internal/sanity-image";
import { SanityImage } from "@workspace/sanity-blocks/internal/sanity-image";
import { cn } from "@workspace/tailwind-config/utils";
import { Button } from "@workspace/ui/components/button";
import { LoaderCircle } from "lucide-react";
import {
  type ComponentProps,
  type FormEvent,
  useId,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";

export interface NewsletterTestimonial {
  authorImage?: SanityImageData | null;
  authorName?: string | null;
  authorRole?: string | null;
  eyebrow?: string | null;
  quote?: RichTextValue;
}

export interface SubscribeNewsletterProps {
  action?: ComponentProps<"form">["action"];
  helperText?: RichTextValue;
  method?: ComponentProps<"form">["method"];
  onSubmit?: ComponentProps<"form">["onSubmit"];
  subTitle?: RichTextValue;
  testimonial?: NewsletterTestimonial | null;
  title?: string | null;
}

type Feedback = {
  kind: "success" | "error";
  message: string;
};

function SubscribeNewsletterButton({
  submitting,
}: Readonly<{ submitting: boolean }>) {
  const { pending } = useFormStatus();
  const busy = pending || submitting;

  return (
    <Button
      aria-label={busy ? "Subscribing..." : "Subscribe to newsletter"}
      className="shrink-0 rounded-none px-5 py-2.5"
      disabled={busy}
      size="sm"
      type="submit"
      variant="secondary"
    >
      {busy ? (
        <LoaderCircle
          aria-hidden="true"
          className="animate-spin"
          size={16}
          strokeWidth={2}
        />
      ) : (
        "Subscribe"
      )}
      <span aria-live="polite" className="sr-only" role="status">
        {busy ? "Subscribing…" : ""}
      </span>
    </Button>
  );
}

function TestimonialPanel({
  testimonial,
}: Readonly<{ testimonial: NewsletterTestimonial }>) {
  const { eyebrow, quote, authorImage, authorName, authorRole } = testimonial;

  return (
    <div className="bleed-x bg-grid-dots p-[var(--container-px,0.5rem)] text-zinc-800 lg:mx-0 lg:p-8 dark:text-zinc-50">
      <div className="flex h-full flex-col gap-12 bg-background p-8">
        <BlockEyebrow eyebrow={eyebrow} />
        <div className="flex flex-col gap-8">
          <RichText
            className="body-text text-muted-foreground [&_strong]:font-normal [&_strong]:text-foreground"
            richText={quote}
          />
          <div className="flex items-center gap-4">
            {authorImage?.id && (
              <div className="size-[42px] shrink-0 overflow-hidden">
                <SanityImage
                  className="h-full w-full rounded-none! object-cover"
                  height={42}
                  image={authorImage}
                  loading="lazy"
                  width={42}
                />
              </div>
            )}
            <div className="flex flex-col text-base leading-6">
              {authorName && (
                <span className="font-medium text-foreground" data-inline-edit>
                  {authorName}
                </span>
              )}
              {authorRole && (
                <span className="text-muted-foreground" data-inline-edit>
                  {authorRole}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SubscribeNewsletter({
  action,
  title,
  subTitle,
  helperText,
  method,
  onSubmit,
  testimonial,
}: Readonly<SubscribeNewsletterProps>) {
  const feedbackId = useId();
  const inFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Preserve explicit actions and handlers supplied by other consumers.
  const useDefaultSignup =
    action === undefined &&
    onSubmit === undefined &&
    (method === undefined || method.toLowerCase() === "post");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (inFlight.current) {
      return;
    }

    const form = event.currentTarget;

    // Capture the value before disabling the input; disabled fields are
    // excluded from FormData.
    const email = new FormData(form).get("email");

    if (typeof email !== "string") {
      setFeedback({
        kind: "error",
        message: "Please enter a valid email address.",
      });
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        body: new URLSearchParams({ email }),
        signal: AbortSignal.timeout(30_000),
      });

      if (response.status === 429) {
        const seconds = Number(response.headers.get("Retry-After"));
        const hasWait = Number.isFinite(seconds) && seconds > 0;

        setFeedback({
          kind: "error",
          message: hasWait
            ? `Too many attempts. Try again in ${Math.ceil(seconds)} seconds.`
            : "Too many attempts. Please try again later.",
        });
        return;
      }

      if (response.status === 400) {
        setFeedback({
          kind: "error",
          message: "Please enter a valid email address.",
        });
        return;
      }

      if (!response.ok) {
        throw new Error("Subscription failed");
      }

      const result: unknown = await response.json();

      if (
        !result ||
        typeof result !== "object" ||
        !("success" in result) ||
        result.success !== true
      ) {
        throw new Error("Unexpected subscription response");
      }

      form.reset();
      setFeedback({
        kind: "success",
        message: "You're subscribed.",
      });
    } catch {
      // Keep the address in the form so a failed request can be retried.
      setFeedback({
        kind: "error",
        message: "We couldn't subscribe you. Please try again later.",
      });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  // A cleared Sanity object is still truthy; check for actual content.
  const hasTestimonialContent = Boolean(
    testimonial &&
      (testimonial.eyebrow ||
        testimonial.authorName ||
        testimonial.authorRole ||
        testimonial.authorImage?.id ||
        (Array.isArray(testimonial.quote) && testimonial.quote.length > 0))
  );

  return (
    <section className="block-section" id="subscribe">
      <div className="container">
        <div
          className={cn(
            hasTestimonialContent &&
              "grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-stretch lg:gap-48"
          )}
        >
          <div className="flex max-w-3xl flex-col items-start gap-8 pb-12">
            <div className="flex flex-col items-start gap-5">
              {title && (
                <h2
                  className="max-w-none text-balance font-normal text-4xl text-foreground leading-tight tracking-[-0.24px] sm:text-5xl"
                  data-inline-edit
                >
                  {title}
                </h2>
              )}
              {subTitle && (
                <RichText
                  className="body-text max-w-[360px] text-muted-foreground"
                  richText={subTitle}
                />
              )}
            </div>
            <div className="flex w-full flex-col items-start gap-3">
              <form
                action={action ?? (useDefaultSignup ? "/api/newsletter" : undefined)}
                aria-busy={submitting}
                className="flex w-full items-center gap-1.5 bg-muted py-1.5 pr-1.5 pl-4 has-[input:focus-visible]:[outline:2px_dotted_var(--foreground)] has-[input:focus-visible]:outline-offset-2"
                method={method ?? "post"}
                onSubmit={useDefaultSignup ? handleSubmit : onSubmit}
              >
                <input
                  aria-describedby={feedback ? feedbackId : undefined}
                  aria-label="Email address"
                  autoComplete="email"
                  className="w-full min-w-0 flex-1 bg-transparent py-1.5 text-base text-foreground outline-none [--autofill-bg:var(--muted)] placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                  disabled={submitting}
                  maxLength={254}
                  name="email"
                  placeholder="Enter your email address"
                  required
                  type="email"
                />
                <SubscribeNewsletterButton submitting={submitting} />
              </form>
              <p
                aria-live="polite"
                className={cn(
                  "text-sm",
                  feedback?.kind === "success"
                    ? "text-green-700 dark:text-green-400"
                    : "text-red-700 dark:text-red-400"
                )}
                id={feedbackId}
                role="status"
              >
                {feedback?.message ?? ""}
              </p>
              {helperText && (
                <RichText
                  className="text-muted-foreground text-sm leading-5 [&_a]:rounded-none [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:decoration-solid"
                  richText={helperText}
                />
              )}
            </div>
          </div>
          {hasTestimonialContent && testimonial && (
            <TestimonialPanel testimonial={testimonial} />
          )}
        </div>
      </div>
    </section>
  );
}