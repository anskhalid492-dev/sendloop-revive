import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { permanentRedirect } from "@/lib/marketing-redirects";

export const Route = createFileRoute("/lead-generation")({
  server: {
    handlers: {
      GET: () => permanentRedirect("/product/crm"),
    },
  },
});
