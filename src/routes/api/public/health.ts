import { createFileRoute } from "@tanstack/react-router";
import { SUPABASE_URL, SUPABASE_PROJECT_ID } from "@/integrations/supabase/config";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          status: "ok",
          supabaseUrl: SUPABASE_URL,
          supabaseProjectId: SUPABASE_PROJECT_ID,
        });
      },
    },
  },
});
