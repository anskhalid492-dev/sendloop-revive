import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MarketingEmpty,
  MarketingLoading,
  MarketingPanel,
} from "@/components/admin/marketing/MarketingUI";
import {
  addMarketingSubscriber,
  importMarketingSubscribers,
  listMarketingSubscribers,
  updateMarketingSubscriber,
} from "@/lib/marketing.functions";

export const Route = createFileRoute("/_authenticated/admin/marketing/subscribers")({
  head: () => ({
    meta: [
      { title: "Marketing Subscribers — MunchReach Admin" },
      {
        name: "description",
        content:
          "Marketing subscriber list with consent state, tags and suppression — separate from MunchReach app user accounts.",
      },
      { property: "og:title", content: "Marketing Subscribers — MunchReach Admin" },
      {
        property: "og:description",
        content: "Manage the internal marketing subscriber base for MunchReach.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SubscribersPage,
});

const STATUSES = ["all", "active", "unsubscribed", "bounced", "complained"];

function SubscribersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [csv, setCsv] = useState("");

  const list = useServerFn(listMarketingSubscribers);
  const add = useServerFn(addMarketingSubscriber);
  const importCsv = useServerFn(importMarketingSubscribers);
  const update = useServerFn(updateMarketingSubscriber);

  const query = useQuery({
    queryKey: ["admin", "marketing", "subscribers", search, status],
    queryFn: () => list({ data: { search, status } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "marketing"] });

  const addMutation = useMutation({
    mutationFn: () => add({ data: { email, firstName, source: "manual", tags: ["manual"] } }),
    onSuccess: () => {
      toast.success("Subscriber added");
      setEmail("");
      setFirstName("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const importMutation = useMutation({
    mutationFn: () => importCsv({ data: { csv } }),
    onSuccess: (result) => {
      toast.success(`Imported ${result.imported} · skipped ${result.skipped}`);
      setCsv("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const actionMutation = useMutation({
    mutationFn: (vars: { id: string; action: "unsubscribe" | "resubscribe" | "delete" }) =>
      update({ data: vars }),
    onSuccess: () => {
      toast.success("Subscriber updated");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <MarketingPanel
        title="Add or import subscribers"
        description="Marketing subscribers are their own list. Adding one here never creates an app account and never touches customer outbound data."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label>Single subscriber</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="email@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="max-w-xs"
              />
              <Input
                placeholder="First name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="max-w-[10rem]"
              />
              <Button
                onClick={() => addMutation.mutate()}
                disabled={!email.includes("@") || addMutation.isPending}
              >
                Add
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>CSV import (email, first name, last name)</Label>
            <Textarea
              rows={3}
              value={csv}
              placeholder={"jane@example.com,Jane,Doe"}
              onChange={(event) => setCsv(event.target.value)}
            />
            <Button
              variant="outline"
              onClick={() => importMutation.mutate()}
              disabled={!csv.trim() || importMutation.isPending}
            >
              Import
            </Button>
          </div>
        </div>
      </MarketingPanel>

      <MarketingPanel
        title="Subscribers"
        description="Suppressed addresses stay in the list so a resubscribe never loses history."
        actions={
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 w-48"
            />
            {STATUSES.map((value) => (
              <Button
                key={value}
                size="sm"
                variant={status === value ? "default" : "outline"}
                onClick={() => setStatus(value)}
              >
                {value}
              </Button>
            ))}
          </div>
        }
      >
        {query.isLoading ? (
          <MarketingLoading label="Loading subscribers" />
        ) : (query.data ?? []).length === 0 ? (
          <MarketingEmpty title="No subscribers match this view" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Email</th>
                  <th className="py-2">Name</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Plan</th>
                  <th className="py-2">Source</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(query.data ?? []).map((row) => (
                  <tr key={String(row.id)}>
                    <td className="py-2 font-medium">{String(row.email)}</td>
                    <td className="py-2 text-muted-foreground">
                      {[row.first_name, row.last_name].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="py-2">
                      <Badge variant={row.status === "active" ? "default" : "outline"}>
                        {String(row.status)}
                      </Badge>
                    </td>
                    <td className="py-2 text-muted-foreground">{String(row.plan ?? "—")}</td>
                    <td className="py-2 text-muted-foreground">{String(row.source ?? "—")}</td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {row.status === "active" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              actionMutation.mutate({
                                id: String(row.id),
                                action: "unsubscribe",
                              })
                            }
                          >
                            Unsubscribe
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              actionMutation.mutate({
                                id: String(row.id),
                                action: "resubscribe",
                              })
                            }
                          >
                            Resubscribe
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            actionMutation.mutate({ id: String(row.id), action: "delete" })
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </MarketingPanel>
    </div>
  );
}
