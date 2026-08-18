import { INBOX_FOLDERS, type InboxFolder } from "@/lib/inbox-model";
import { cn } from "@/lib/utils";

export function InboxSidebar({
  folder,
  counts,
  onSelect,
}: {
  folder: InboxFolder;
  counts: Record<string, number>;
  onSelect: (folder: InboxFolder) => void;
}) {
  return (
    <nav aria-label="Inbox folders" className="flex h-full flex-col gap-1 overflow-y-auto p-3">
      {INBOX_FOLDERS.map((item) => {
        const count = counts[item.id] ?? 0;
        const active = folder === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span className="truncate">{item.label}</span>
            {count > 0 ? (
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
