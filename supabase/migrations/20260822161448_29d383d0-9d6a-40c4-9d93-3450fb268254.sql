DROP FUNCTION IF EXISTS public.run_lead_retention_cleanup(integer, integer);

CREATE OR REPLACE FUNCTION public.run_lead_retention_cleanup(
  _batch_size integer DEFAULT 500,
  _max_batches integer DEFAULT 40
)
RETURNS TABLE(out_workspace_id uuid, out_deleted_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ws_id uuid;
  removed integer;
  total integer;
  loops integer;
  started timestamptz;
  any_found boolean := false;
BEGIN
  FOR ws_id IN
    SELECT l.workspace_id
    FROM public.leads l
    WHERE l.retention_expires_at <= now()
    GROUP BY l.workspace_id
  LOOP
    any_found := true;
    started := now();
    total := 0;
    loops := 0;
    BEGIN
      LOOP
        EXIT WHEN loops >= _max_batches;
        WITH doomed AS (
          SELECT l.id FROM public.leads l
          WHERE l.workspace_id = ws_id AND l.retention_expires_at <= now()
          ORDER BY l.retention_expires_at
          LIMIT _batch_size
        )
        DELETE FROM public.leads l USING doomed d
        WHERE l.id = d.id AND l.workspace_id = ws_id;
        GET DIAGNOSTICS removed = ROW_COUNT;
        total := total + removed;
        loops := loops + 1;
        EXIT WHEN removed = 0;
      END LOOP;

      INSERT INTO public.lead_retention_runs
        (workspace_id, deleted_count, batches, status, started_at, finished_at)
      VALUES (ws_id, total, loops, 'success', started, now());
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.lead_retention_runs
        (workspace_id, deleted_count, batches, status, error, started_at, finished_at)
      VALUES (ws_id, total, loops, 'error', SQLERRM, started, now());
    END;

    out_workspace_id := ws_id;
    out_deleted_count := total;
    RETURN NEXT;
  END LOOP;

  IF NOT any_found THEN
    INSERT INTO public.lead_retention_runs (workspace_id, deleted_count, batches, status)
    VALUES (NULL, 0, 0, 'idle');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_lead_retention_cleanup(integer, integer) FROM PUBLIC, anon, authenticated;