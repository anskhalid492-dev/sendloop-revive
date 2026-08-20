import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { renderRobots, validateRobots, type RobotsConfig } from "@/lib/site-content-model";
import { getAdminSiteData, getSitemapPreview, saveRobotsConfig } from "@/lib/site-content.functions";

export const Route = createFileRoute("/_authenticated/admin/seo-files")({
  head: () => ({
    meta: [
      { title: "Robots & Sitemap — Sendloop Admin" },
      {
        name: "description",
        content: "Edit robots.txt rules and review the exact URLs Sendloop publishes in its sitemap.",
      },
    ],
  }),
  component: AdminSeoFilesRoute,
});

function AdminSeoFilesRoute() {
  const queryClient = useQueryClient();
  const fetchData = useServerFn(getAdminSiteData);
  const fetchSitemap = useServerFn(getSitemapPreview);
  const save = useServerFn(saveRobotsConfig);

  const data = useQuery({ queryKey: ["admin-site-data"], queryFn: () => fetchData() });
  const sitemap = useQuery({ queryKey: ["admin-sitemap"], queryFn: () => fetchSitemap() });

  const [config, setConfig] = useState<RobotsConfig | null>(null);
  useEffect(() => {
    if (data.data?.robots && !config) setConfig(data.data.robots as RobotsConfig);
  }, [data.data?.robots, config]);

  const mutation = useMutation({
    mutationFn: (input: RobotsConfig) => save({ data: input }),
    onSuccess: () => {
      toast.success("robots.txt updated");
      queryClient.invalidateQueries({ queryKey: ["admin-site-data"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const error = config ? validateRobots(config) : null;
  const preview = config ? renderRobots(config) : "";

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Robots &amp; Sitemap</h1>
        <p className="text-sm text-muted-foreground">
          Both files are generated live from this configuration and the page registry.
        </p>
      </div>

      <Tabs defaultValue="robots">
        <TabsList>
          <TabsTrigger value="robots">robots.txt</TabsTrigger>
          <TabsTrigger value="sitemap">sitemap.xml ({sitemap.data?.entries.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="robots" className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            {!config ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <>
                {config.rules.map((rule, index) => (
                  <div key={index} className="space-y-3 rounded-lg border border-border/60 p-4">
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1.5">
                        <Label>User-agent</Label>
                        <Input
                          value={rule.user_agent}
                          onChange={(e) => {
                            const rules = [...config.rules];
                            rules[index] = { ...rule, user_agent: e.target.value };
                            setConfig({ ...config, rules });
                          }}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() =>
                          setConfig({ ...config, rules: config.rules.filter((_, i) => i !== index) })
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Allow (one path per line)</Label>
                        <Textarea
                          rows={4}
                          className="font-mono text-xs"
                          value={rule.allow.join("\n")}
                          onChange={(e) => {
                            const rules = [...config.rules];
                            rules[index] = { ...rule, allow: e.target.value.split("\n") };
                            setConfig({ ...config, rules });
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Disallow (one path per line)</Label>
                        <Textarea
                          rows={4}
                          className="font-mono text-xs"
                          value={rule.disallow.join("\n")}
                          onChange={(e) => {
                            const rules = [...config.rules];
                            rules[index] = { ...rule, disallow: e.target.value.split("\n") };
                            setConfig({ ...config, rules });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig({
                      ...config,
                      rules: [...config.rules, { user_agent: "Googlebot", allow: ["/"], disallow: [] }],
                    })
                  }
                >
                  <Plus className="mr-1.5 size-4" /> Add user-agent block
                </Button>

                <div className="space-y-1.5">
                  <Label>Sitemap URL</Label>
                  <Input
                    value={config.sitemap_url}
                    onChange={(e) => setConfig({ ...config, sitemap_url: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Extra directives</Label>
                  <Textarea
                    rows={3}
                    className="font-mono text-xs"
                    value={config.extra}
                    onChange={(e) => setConfig({ ...config, extra: e.target.value })}
                  />
                </div>
                {error ? <p className="text-xs text-destructive">{error}</p> : null}
                <Button disabled={!!error || mutation.isPending} onClick={() => mutation.mutate(config)}>
                  {mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Save robots.txt
                </Button>
              </>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Live preview</p>
              <a
                href="/robots.txt"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Open /robots.txt <ExternalLink className="size-3" />
              </a>
            </div>
            <pre className="max-h-[520px] overflow-auto rounded-lg border border-border/60 bg-muted/30 p-4 font-mono text-xs">
              {preview}
            </pre>
          </div>
        </TabsContent>

        <TabsContent value="sitemap" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Exactly what <span className="font-mono">/sitemap.xml</span> serves right now.
            </p>
            <a
              href="/sitemap.xml"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Open /sitemap.xml <ExternalLink className="size-3" />
            </a>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border/60">
              <p className="border-b border-border/60 px-4 py-2.5 text-sm font-medium">Included URLs</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Path</TableHead>
                    <TableHead className="w-28">Frequency</TableHead>
                    <TableHead className="w-20">Priority</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(sitemap.data?.entries ?? []).map((entry) => (
                    <TableRow key={entry.path}>
                      <TableCell className="font-mono text-xs">{entry.path}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{entry.changefreq}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{entry.priority}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="rounded-lg border border-border/60">
              <p className="border-b border-border/60 px-4 py-2.5 text-sm font-medium">Excluded</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Path</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(sitemap.data?.excluded ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="py-8 text-center text-xs text-muted-foreground">
                        Nothing excluded.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (sitemap.data?.excluded ?? []).map((row) => (
                      <TableRow key={row.path}>
                        <TableCell className="font-mono text-xs">{row.path}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.reason}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
