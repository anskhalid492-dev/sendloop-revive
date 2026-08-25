import { createFileRoute } from '@tanstack/react-router';
import { SUPABASE_URL, SUPABASE_PROJECT_ID } from '@/integrations/supabase/config';

export const Route = createFileRoute('/api/public/backend-check')({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const [ws, convs] = await Promise.all([
          supabaseAdmin.from('workspaces').select('id', { count: 'exact', head: true }),
          supabaseAdmin.from('conversation_messages').select('id', { count: 'exact', head: true }),
        ]);
        return Response.json({
          url: SUPABASE_URL,
          projectId: SUPABASE_PROJECT_ID,
          workspaces: ws.count ?? null,
          workspacesError: ws.error?.message ?? null,
          conversationMessages: convs.count ?? null,
          conversationMessagesError: convs.error?.message ?? null,
        });
      },
    },
  },
});
