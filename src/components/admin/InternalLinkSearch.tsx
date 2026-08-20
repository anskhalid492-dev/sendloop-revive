/** Searchable internal link picker: MunchReach pages and blog posts. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { searchInternalLinks } from "@/lib/blog.functions";

export function InternalLinkSearch({
  onPick,
}: {
  onPick: (href: string, label: string) => void;
}) {
  const [term, setTerm] = useState("");
  const search = useServerFn(searchInternalLinks);
  const { data, isFetching } = useQuery({
    queryKey: ["internal-links", term],
    queryFn: () => search({ data: { query: term } }),
    staleTime: 30_000,
  });

  const results = data?.results ?? [];

  return (
    <div className="space-y-2">
      <Label htmlFor="internal-link-search">Link to a MunchReach page or blog post</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
        <Input
          id="internal-link-search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search pages and posts…"
          className="pl-9"
        />
      </div>
      <div className="max-h-44 overflow-y-auto rounded-md border border-border">
        {results.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            {isFetching ? "Searching…" : "No matching pages or posts."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {results.map((result) => (
              <li key={`${result.kind}-${result.id}`}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60"
                  onClick={() => onPick(result.href, result.label)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{result.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{result.href}</span>
                  </span>
                  <Badge variant="secondary" className="shrink-0 text-[10px] capitalize">
                    {result.kind}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
