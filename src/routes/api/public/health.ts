import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("public_auth_settings");
        return Response.json({
          status: "ok",
          adminRpc: error ? { error: error.message } : { data },
        });
      },
    },
  },
});
