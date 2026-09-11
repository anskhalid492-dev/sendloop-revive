import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// Reports server-side errors to Sentry (error monitoring only). Imported
// lazily so the edge SDK never loads in the browser bundle.
async function reportServerError(error: unknown, context: Record<string, unknown>) {
  try {
    const { captureServerError } = await import("./lib/sentry.server");
    captureServerError(error, context);
  } catch {
    // Monitoring must never affect the response.
  }
}

const errorMiddleware = createMiddleware().server(async ({ next, ...context }) => {
  try {
    return await next();
  } catch (error) {
    await reportServerError(error, { handlerType: (context as any).handlerType });
    if (
      context.handlerType === "serverFn" ||
      (error != null && typeof error === "object" && "statusCode" in error)
    ) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Baseline security headers. Deliberately no enforcing CSP: the app loads
// Stripe, Supabase and remote fonts, and a wrong policy would break checkout.
const securityHeaders = createMiddleware().server(async ({ next }) => {
  const result: any = await next();
  const response: Response | undefined = result?.response;
  if (response?.headers) {
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return result;
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware, securityHeaders],
}));
