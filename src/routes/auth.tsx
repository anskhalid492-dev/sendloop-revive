import { createFileRoute, redirect } from "@tanstack/react-router";
import { NOINDEX_META } from "@/lib/seo";

/**
 * Legacy entry point. The auth gate and older links point here, so keep it as
 * a permanent redirect into the dedicated sign-in screen.
 */
export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — MunchReach" }, NOINDEX_META] }),
  beforeLoad: () => {
    throw redirect({ to: "/signin", replace: true });
  },
});
