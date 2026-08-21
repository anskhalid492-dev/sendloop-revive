import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { FaqBlock } from "@/components/site/MarketingPage";
import { listPageFaqs } from "@/lib/faqs.functions";

/**
 * Page-scoped FAQ section.
 *
 * Each page owns its own questions: the ones written in code act as the
 * baseline, until an admin publishes questions for that page from
 * Admin → Website FAQs. When neither source has content the section is
 * omitted entirely rather than rendering an empty block.
 */
export function PageFaqs({
  page,
  defaults = [],
  eyebrow,
  title,
  description,
}: {
  /** Page slug used for admin assignment, e.g. "pricing". */
  page: string;
  defaults?: { q: string; a: string }[];
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  const fetchFaqs = useServerFn(listPageFaqs);
  const { data } = useQuery({
    queryKey: ["page-faqs", page],
    queryFn: () => fetchFaqs({ data: { page } }),
    staleTime: 5 * 60 * 1000,
  });

  const managed = (data ?? []).map((f) => ({ q: f.question, a: f.answer }));
  // Admin-managed questions replace the in-code baseline for that page, so a
  // page never shows two near-identical versions of the same question.
  const faqs = managed.length > 0 ? managed : defaults;

  if (faqs.length === 0) return null;

  return (
    <FaqBlock
      faqs={faqs}
      {...(eyebrow ? { eyebrow } : {})}
      {...(title ? { title } : {})}
      {...(description ? { description } : {})}
    />
  );
}
