import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy entry point. The auth gate and older links point here, so keep it as
 * a permanent redirect into the dedicated sign-in screen.
 */
export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    throw redirect({ to: "/signin", replace: true });
  },
});
