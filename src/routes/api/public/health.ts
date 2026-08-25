import { createFileRoute } from "@tanstack/react-router";
import { createSupabaseAdminClient } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const admin = createSupabaseAdminClient();
        const { data, error } = await admin.rpc("public_auth_settings");
        return Response.json({
          status: "ok",
          adminRpc: error ? { error: error.message } : { data },
        });
      },
    },
  },
});
