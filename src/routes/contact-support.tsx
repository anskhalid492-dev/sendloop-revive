import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, LifeBuoy, Clock, BookOpen, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarketingLayout, PageHero, Section, metaFor } from "@/components/site/MarketingPage";
import { submitPublicSupportRequest } from "@/lib/trust-center.functions";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_PRIORITIES,
  SUPPORT_PRIORITY_LABEL,
  ticketReference,
} from "@/lib/support-model";

export const Route = createFileRoute("/contact-support")({
  head: () =>
    metaFor(
      "Contact Support — MunchReach",
      "Open a MunchReach support ticket. Tell us the category, priority and what happened, attach a screenshot, and a real person will reply.",
      "/contact-support",
    ),
  component: ContactSupportPage,
});

const MAX_ATTACHMENT = 5 * 1024 * 1024;

function ContactSupportPage() {
  const submit = useServerFn(submitPublicSupportRequest);
  const [pending, setPending] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("account");
  const [priority, setPriority] = useState<string>("normal");

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("attachment");

    let attachment: { name: string; type: string; data: string } | undefined;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_ATTACHMENT) {
        toast.error("Attachment must be under 5 MB.");
        return;
      }
      const buffer = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
      attachment = { name: file.name, type: file.type, data: btoa(binary) };
    }

    setPending(true);
    try {
      const res = await submit({
        data: {
          name: String(fd.get("name") ?? ""),
          email: String(fd.get("email") ?? ""),
          workspace: String(fd.get("workspace") ?? ""),
          category,
          priority: priority as "low" | "normal" | "high" | "urgent",
          subject: String(fd.get("subject") ?? ""),
          message: String(fd.get("message") ?? ""),
          ...(attachment ? { attachment } : {}),
        },
      });
      form.reset();
      setReference(ticketReference(res.ticketId));
      toast.success("Ticket created — check your email for updates.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the ticket.");
    } finally {
      setPending(false);
    }
  };

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Support"
        title="Contact"
        highlight="support"
        description="Open a ticket without signing in. Tell us what happened and we'll pick it up — urgent deliverability issues are triaged first."
      />

      <Section>
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
            {reference ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto size-10 text-emerald-500" />
                <h2 className="mt-4 text-xl font-semibold">Ticket {reference} created</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Our team can see it in the support console. We'll reply to the email address you
                  gave us — keep the reference handy if you follow up.
                </p>
                <Button className="mt-6" variant="outline" onClick={() => setReference(null)}>
                  Open another ticket
                </Button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" name="name" required maxLength={120} placeholder="Ada Lovelace" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      required
                      maxLength={255}
                      placeholder="ada@company.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="workspace">Workspace (optional)</Label>
                  <Input
                    id="workspace"
                    name="workspace"
                    maxLength={160}
                    placeholder="Which workspace is affected?"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger id="category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORT_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {SUPPORT_CATEGORY_LABEL[c] ?? c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger id="priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORT_PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {SUPPORT_PRIORITY_LABEL[p] ?? p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    name="subject"
                    required
                    maxLength={200}
                    placeholder="Campaign stopped sending this morning"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    name="message"
                    required
                    rows={7}
                    minLength={10}
                    maxLength={6000}
                    placeholder="What happened, what you expected, and any campaign or mailbox names involved."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="attachment">Attachment (optional, max 5 MB)</Label>
                  <Input id="attachment" name="attachment" type="file" />
                </div>

                <Button type="submit" size="lg" disabled={pending}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Submit ticket
                </Button>
              </form>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-6">
              <Clock className="size-5 text-primary" />
              <h2 className="mt-3 text-base font-semibold">Response times</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Tickets are answered by a real person, usually within one business day. Mark a
                ticket urgent only for issues stopping active sending — those are triaged first.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <BookOpen className="size-5 text-primary" />
              <h2 className="mt-3 text-base font-semibold">Check first</h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                <li>
                  <a className="text-primary hover:underline" href="/user-guide">User Guide & Alerts</a>
                </li>
                <li>
                  <a className="text-primary hover:underline" href="/help-center">Help Center</a>
                </li>
                <li>
                  <a className="text-primary hover:underline" href="/deliverability-guide">
                    Deliverability Guide
                  </a>
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <LifeBuoy className="size-5 text-primary" />
              <h2 className="mt-3 text-base font-semibold">Prefer email?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Write to support@munchreach.com and we'll create the ticket for you.
              </p>
            </div>
          </aside>
        </div>
      </Section>
    </MarketingLayout>
  );
}
