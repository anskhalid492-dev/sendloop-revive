import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HelpCircle, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteFaq, listAllFaqs, saveFaq } from "@/lib/faqs.functions";
import type { SiteFaq } from "@/lib/faqs.server";
import { FAQ_PAGE_SLUGS } from "@/lib/faq-pages";

export const Route = createFileRoute("/_authenticated/mranuskhalid/faqs")({
  head: () => ({
    meta: [
      { title: "Website FAQs — MunchReach Admin" },
      {
        name: "description",
        content: "Write and assign FAQs to individual MunchReach marketing pages.",
      },
    ],
  }),
  component: AdminFaqsPage,
});

type Draft = {
  id?: string;
  pageSlug: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  published: boolean;
};

const emptyDraft: Draft = {
  pageSlug: "features",
  question: "",
  answer: "",
  category: "general",
  sortOrder: 0,
  published: true,
};

function AdminFaqsPage() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listAllFaqs);
  const save = useServerFn(saveFaq);
  const remove = useServerFn(deleteFaq);

  const { data: faqs = [], isLoading } = useQuery({
    queryKey: ["admin-faqs"],
    queryFn: () => fetchAll({}),
  });

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [filter, setFilter] = useState<string>("all");

  const saveMutation = useMutation({
    mutationFn: (d: Draft) =>
      save({
        data: {
          ...(d.id ? { id: d.id } : {}),
          pageSlug: d.pageSlug,
          question: d.question,
          answer: d.answer,
          category: d.category,
          sortOrder: d.sortOrder,
          published: d.published,
        },
      }),
    onSuccess: () => {
      toast.success(draft.id ? "FAQ updated" : "FAQ added");
      setDraft(emptyDraft);
      void qc.invalidateQueries({ queryKey: ["admin-faqs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("FAQ removed");
      void qc.invalidateQueries({ queryKey: ["admin-faqs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    const visible = filter === "all" ? faqs : faqs.filter((f) => f.page_slug === filter);
    const map = new Map<string, SiteFaq[]>();
    for (const f of visible) {
      const list = map.get(f.page_slug) ?? [];
      list.push(f);
      map.set(f.page_slug, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [faqs, filter]);

  const pageOptions = useMemo(() => {
    const set = new Set<string>([...FAQ_PAGE_SLUGS, ...faqs.map((f) => f.page_slug)]);
    return [...set].sort();
  }, [faqs]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Website FAQs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          FAQs appear only on the page they are assigned to. Pages with no published FAQs simply
          skip the section — nothing empty is rendered.
        </p>
      </header>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="text-sm font-semibold">{draft.id ? "Edit FAQ" : "Add an FAQ"}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="faq-page">Page</Label>
            <Select
              value={draft.pageSlug}
              onValueChange={(v) => setDraft((d) => ({ ...d, pageSlug: v }))}
            >
              <SelectTrigger id="faq-page">
                <SelectValue placeholder="Choose a page" />
              </SelectTrigger>
              <SelectContent>
                {pageOptions.map((slug) => (
                  <SelectItem key={slug} value={slug}>
                    {slug}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="faq-category">Category</Label>
            <Input
              id="faq-category"
              value={draft.category}
              onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
              placeholder="pricing"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="faq-question">Question</Label>
            <Input
              id="faq-question"
              value={draft.question}
              onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))}
              placeholder="Can I connect my own email accounts?"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="faq-answer">Answer</Label>
            <Textarea
              id="faq-answer"
              rows={4}
              value={draft.answer}
              onChange={(e) => setDraft((d) => ({ ...d, answer: e.target.value }))}
              placeholder="Yes — connect the mailboxes you already send from…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="faq-order">Display order</Label>
            <Input
              id="faq-order"
              type="number"
              min={0}
              value={draft.sortOrder}
              onChange={(e) => setDraft((d) => ({ ...d, sortOrder: Number(e.target.value) }))}
            />
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch
              id="faq-published"
              checked={draft.published}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, published: v }))}
            />
            <Label htmlFor="faq-published">Published</Label>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Button
            onClick={() => saveMutation.mutate(draft)}
            disabled={saveMutation.isPending || draft.question.length < 5 || draft.answer.length < 5}
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {draft.id ? "Save changes" : "Add FAQ"}
          </Button>
          {draft.id ? (
            <Button variant="ghost" onClick={() => setDraft(emptyDraft)}>
              Cancel
            </Button>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold">Published library</h2>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All pages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All pages</SelectItem>
              {pageOptions.map((slug) => (
                <SelectItem key={slug} value={slug}>
                  {slug}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : grouped.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-dashed border-border/70 px-5 py-10 text-sm text-muted-foreground">
            <HelpCircle className="size-4" />
            No FAQs yet. Pages fall back to the questions written into each page.
          </p>
        ) : (
          grouped.map(([slug, items]) => (
            <div key={slug} className="rounded-2xl border border-border/70 bg-card">
              <div className="border-b border-border/60 px-5 py-3 text-sm font-semibold">
                /{slug}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {items.length} {items.length === 1 ? "question" : "questions"}
                </span>
              </div>
              <ul className="divide-y divide-border/60">
                {items.map((f) => (
                  <li key={f.id} className="flex items-start gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{f.question}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{f.answer}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {f.category} · order {f.sort_order} ·{" "}
                        {f.published ? "published" : "hidden"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setDraft({
                            id: f.id,
                            pageSlug: f.page_slug,
                            question: f.question,
                            answer: f.answer,
                            category: f.category,
                            sortOrder: f.sort_order,
                            published: f.published,
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate(f.id)}
                        aria-label={`Delete ${f.question}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
