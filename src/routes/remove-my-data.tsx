import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, Clock, Mail, Loader2 } from "lucide-react";
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
import { submitPrivacyRequest } from "@/lib/trust-center.functions";
import { PRIVACY_REQUEST_TYPES } from "@/lib/trust-center-model";

export const Route = createFileRoute("/remove-my-data")({
  head: () =>
    metaFor(
      "Remove My Data — MunchReach Privacy Requests",
      "Ask MunchReach to delete your personal data, close your account, remove contact data, suppress marketing email, or access a copy of your data.",
      "/remove-my-data",
    ),
  component: RemoveMyDataPage,
});

function RemoveMyDataPage() {
  const submit = useServerFn(submitPrivacyRequest);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [requestType, setRequestType] = useState<string>(PRIVACY_REQUEST_TYPES[0].value);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    setPending(true);
    try {
      await submit({
        data: {
          name: String(fd.get("name") ?? ""),
          email: String(fd.get("email") ?? ""),
          company: String(fd.get("company") ?? ""),
          requestType,
          details: String(fd.get("details") ?? ""),
        },
      });
      form.reset();
      setDone(true);
      toast.success("Request received — we'll email you about next steps.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit the request.");
    } finally {
      setPending(false);
    }
  };

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Privacy"
        title="Remove"
        highlight="my data"
        description="Request access, correction or removal of account, contact, campaign, conversation, mailbox-related or activity data associated with you."
      />

      <Section>
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="surface-card rounded-2xl border border-border bg-card p-6 md:p-8">
            {done ? (
              <div className="py-8 text-center">
                <ShieldCheck className="mx-auto size-10 text-primary" />
                <h2 className="mt-4 text-xl font-semibold">Request received</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  We log every privacy request for review. Nothing is deleted automatically — we
                   verify your identity and authority first, then email you once it has been processed.
                </p>
                <Button className="mt-6" variant="outline" onClick={() => setDone(false)}>
                  Submit another request
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
                    <Label htmlFor="email">Email address</Label>
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="company">Company (optional)</Label>
                    <Input id="company" name="company" maxLength={160} placeholder="Example Inc" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="request-type">Request type</Label>
                    <Select value={requestType} onValueChange={setRequestType}>
                      <SelectTrigger id="request-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIVACY_REQUEST_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="details">Details</Label>
                  <Textarea
                    id="details"
                    name="details"
                    required
                    rows={6}
                    minLength={10}
                    maxLength={4000}
                    placeholder="Tell us which account, email address, lead/contact record, campaign, conversation, connected mailbox or activity record the request covers."
                  />
                </div>
                <Button type="submit" size="lg" disabled={pending}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Submit request
                </Button>
                <p className="text-xs text-muted-foreground">
                  We use the details you provide only to verify and process this request.
                </p>
              </form>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-6">
              <Clock className="size-5 text-primary" />
              <h2 className="mt-3 text-base font-semibold">What happens next</h2>
              <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>1. Your request is logged for review — nothing is deleted immediately.</li>
                <li>2. We verify your identity and, where relevant, your authority over the workspace or data.</li>
                <li>3. We locate applicable account, lead/contact, campaign, conversation, mailbox-related and activity data.</li>
                <li>4. We action the request and email you a confirmation of the outcome.</li>
              </ol>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <Mail className="size-5 text-primary" />
              <h2 className="mt-3 text-base font-semibold">Contacted by a MunchReach customer?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                 MunchReach customers choose their Recipients, connect their own Email Accounts and
                 send their own Campaigns. For that data we generally act as the processor, so we may
                 need to refer the request to the responsible customer. Tell us which message and
                 sender address are involved so we can identify the correct workspace.
              </p>
            </div>
             <div className="rounded-2xl border border-border bg-card p-6">
               <ShieldCheck className="size-5 text-primary" />
               <h2 className="mt-3 text-base font-semibold">What may be retained</h2>
               <p className="mt-2 text-sm text-muted-foreground">
                 We may retain limited billing, tax, fraud-prevention, security, dispute or legal
                 records where required or permitted by law. Suppression records may also be retained
                 so an unsubscribe, complaint or other do-not-contact request remains effective.
               </p>
             </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <ShieldCheck className="size-5 text-primary" />
              <h2 className="mt-3 text-base font-semibold">Related pages</h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                <li>
                  <a className="text-primary hover:underline" href="/privacy">Privacy Policy</a>
                </li>
                <li>
                  <a className="text-primary hover:underline" href="/dpa">Data Processing Agreement</a>
                </li>
                <li>
                  <a className="text-primary hover:underline" href="/subprocessors">Subprocessors</a>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </Section>
    </MarketingLayout>
  );
}
