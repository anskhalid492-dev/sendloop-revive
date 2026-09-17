import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The AI Campaign Writer page moved from /products/ai-campaign-writer to
 * /ai-campaign-writer. This route keeps the old address working by sending
 * every visitor (and search engine) to the new one.
 */
export const Route = createFileRoute("/products/ai-campaign-writer")({
  beforeLoad: () => {
    throw redirect({ to: "/ai-campaign-writer", replace: true });
  },
});
