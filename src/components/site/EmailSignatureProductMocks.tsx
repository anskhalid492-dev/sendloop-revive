import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  Globe,
  Image,
  Italic,
  Link2,
  Mail,
  Phone,
  Underline,
  UserRound,
} from "lucide-react";

import { cn } from "@/lib/utils";

const variables = [
  "first_name",
  "last_name",
  "email",
  "company",
  "job_title",
  "phone",
  "website",
];

function WindowBar({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-secondary/45 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="size-2.5 rounded-full bg-destructive/55" />
        <span className="size-2.5 rounded-full bg-warning/65" />
        <span className="size-2.5 rounded-full bg-success/60" />
      </div>
      <span className="text-xs font-semibold text-muted-foreground">{title}</span>
      <span className="w-12" />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium">
        {children}
      </div>
    </div>
  );
}

function EditorToolbar() {
  const icons = [Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Link2, Mail, Phone, Image];
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border bg-secondary/25 p-2">
      {icons.map((Icon, index) => (
        <span
          key={index}
          className="grid size-7 place-items-center rounded-md text-muted-foreground first:bg-primary/10 first:text-primary"
        >
          <Icon className="size-3.5" />
        </span>
      ))}
    </div>
  );
}

export function SignatureHeroMock() {
  return (
    <div className="relative mx-auto w-full max-w-2xl lg:translate-x-4">
      <div className="absolute -inset-3 rounded-3xl bg-primary/10 blur-2xl" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-glow)]">
        <WindowBar title="Settings · Email Signature" />
        <div className="grid gap-4 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mailbox">
              <span className="truncate">alex@northstar.io</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </Field>
            <Field label="Signature name"><span>Alex — Outreach</span></Field>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/25 px-3 py-2.5">
            <div>
              <p className="text-xs font-semibold">Signature configured</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Added to outgoing email</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium">
              Enabled
              <span className="flex h-5 w-9 items-center justify-end rounded-full bg-primary p-0.5">
                <span className="size-4 rounded-full bg-primary-foreground shadow-sm" />
              </span>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="min-w-0">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Rich-text editor</p>
              <div className="overflow-hidden rounded-lg border border-border bg-background">
                <EditorToolbar />
                <div className="min-h-32 p-3 text-xs leading-5">
                  <p className="font-semibold">Alex Morgan</p>
                  <p className="text-muted-foreground">Partnerships · Northstar</p>
                  <p className="mt-1 text-primary">northstar.io</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {variables.slice(0, 4).map((variable) => (
                  <span key={variable} className="rounded-md border border-border bg-card px-1.5 py-1 font-mono text-[9px] text-primary">
                    {`{{${variable}}}`}
                  </span>
                ))}
              </div>
            </div>
            <div className="min-w-0">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
              <div className="h-full min-h-48 rounded-lg border border-border bg-background p-4 text-xs leading-5">
                <p className="text-muted-foreground">Hi John,</p>
                <p className="mt-3 text-muted-foreground">I wanted to follow up regarding the proposal.</p>
                <div className="mt-4 border-t border-border pt-3">
                  <p>Best regards,</p>
                  <p className="mt-2 font-semibold">Alex Morgan</p>
                  <p className="text-muted-foreground">Partnerships · Northstar</p>
                  <p className="text-primary">northstar.io</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -right-2 -bottom-4 hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold shadow-lg sm:flex">
        <span className="grid size-6 place-items-center rounded-md bg-success/10 text-success"><Check className="size-3.5" /></span>
        Saved for this mailbox
      </div>
    </div>
  );
}

export function VariableCloud() {
  const iconByVariable = {
    first_name: UserRound,
    last_name: UserRound,
    email: Mail,
    company: Building2,
    job_title: BriefcaseBusiness,
    phone: Phone,
    website: Globe,
  } as const;
  return (
    <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-3">
      {variables.map((variable, index) => {
        const Icon = iconByVariable[variable as keyof typeof iconByVariable];
        return (
          <span
            key={variable}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3.5 py-2.5 font-mono text-xs font-medium shadow-sm",
              index % 3 === 0 ? "border-primary/25 bg-primary/8 text-primary" : "border-border bg-card text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {`{{${variable}}}`}
          </span>
        );
      })}
    </div>
  );
}

export function MailboxSignatureMock() {
  const mailboxes = [
    { email: "alex@northstar.io", signature: "Alex — Outreach", enabled: true },
    { email: "maya@northstar.io", signature: "Maya — Partnerships", enabled: true },
    { email: "hello@northstar.io", signature: "Company signature", enabled: false },
  ];
  return (
    <div className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <WindowBar title="Mailbox signatures" />
      <div className="divide-y divide-border">
        {mailboxes.map((mailbox) => (
          <div key={mailbox.email} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Mail className="size-4" /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{mailbox.email}</p>
                <p className="text-xs text-muted-foreground">Connected mailbox</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">{mailbox.signature}</p>
              <p className="text-xs text-muted-foreground">Signature name</p>
            </div>
            <span className={cn("w-fit rounded-full px-2.5 py-1 text-xs font-semibold", mailbox.enabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
              {mailbox.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SignaturePreviewMock() {
  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <p className="text-sm font-semibold">Preview</p>
          <p className="text-xs text-muted-foreground">Using this mailbox&apos;s own details.</p>
        </div>
        <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Enabled</span>
      </div>
      <div className="p-5 sm:p-8">
        <div className="rounded-lg border border-border bg-background p-5 text-sm leading-6 sm:p-7">
          <p>Hi John,</p>
          <p className="mt-4 text-muted-foreground">I wanted to follow up regarding the proposal.</p>
          <p className="mt-5">Best regards,</p>
          <div className="mt-3 border-l-2 border-primary pl-4">
            <p className="font-bold">Alex Morgan</p>
            <p className="text-muted-foreground">Partnerships Manager</p>
            <p className="text-muted-foreground">Northstar</p>
            <p className="text-primary">northstar.io</p>
          </div>
        </div>
      </div>
    </div>
  );
}