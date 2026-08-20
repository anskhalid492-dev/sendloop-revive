/**
 * Admin → System settings → Configuration history.
 *
 * Reads the settings-related entries from the admin audit log so every change
 * shows who made it, when, the before/after value and the stated reason.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Loader2 } from "lucide-react";

import { getPlatformConfigAdmin } from "@/lib/platform-config.functions";

export function ConfigHistoryPanel() {
  const load = useServerFn(getPlatformConfigAdmin);
  const query = useQuery({ queryKey: ["admin-platform-config"], queryFn: () => load() });
  const history = query.data?.history ?? [];

  return (
    <div className="surface-card p-6">
      <div className="border-b border-border/40 pb-4">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <History className="size-4" /> Configuration history
        </h3>
        <p className="text-sm text-muted-foreground">
          Every system settings change, with the actor, timestamp and reason.
        </p>
      </div>

      {query.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading history…
        </div>
      ) : history.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">No configuration changes recorded yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Actor</th>
                <th className="py-2 pr-3 font-medium">Setting</th>
                <th className="py-2 pr-3 font-medium">Before</th>
                <th className="py-2 pr-3 font-medium">After</th>
                <th className="py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {history.map((row, index) => (
                <tr key={`${row.id}-${index}`} className="align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-xs">{row.actor_email ?? "—"}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{row.setting}</td>
                  <td className="max-w-[180px] truncate py-2 pr-3 text-xs text-muted-foreground">
                    {row.from || "—"}
                  </td>
                  <td className="max-w-[180px] truncate py-2 pr-3 text-xs">{row.to || "—"}</td>
                  <td className="py-2 text-xs text-muted-foreground">{row.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
