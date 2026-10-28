import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ExternalLink, LifeBuoy, List, Minus, Plus, Send, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { createMunchmateGuestTicket, createMunchmateTicket, munchmateChat } from "@/lib/munchmate.functions";
import { isAllowedLink } from "@/lib/munchmate/retrieval";
import { SUPPORT_CATEGORIES, SUPPORT_CATEGORY_LABEL, SUPPORT_PRIORITIES, SUPPORT_PRIORITY_LABEL } from "@/lib/support-model";
import { MunchMateMascot } from "./MunchMateMascot";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
  sources?: Array<{ title: string; url: string }>;
  offerTicket?: boolean;
  feedback?: "up" | "down";
};
type Thread = { id: string; title: string; updatedAt: string; messages: Msg[]; ticketRef?: string };

const STORE = "munchmate.threads.v1";
const GREETING = "Hey! I'm MunchMate 👋\nYour MunchReach assistant. How can I help you today?";
const SUGGESTIONS = [
  "How do I create my first campaign?",
  "How does email warmup work?",
  "How do I connect my mailbox?",
  "How can I improve email deliverability?",
  "How do I import leads?",
  "How does Unibox work?",
  "How do I manage my campaigns?",
];

const uid = () => crypto.randomUUID();
const newThread = (): Thread => ({ id: uid(), title: "New conversation", updatedAt: new Date().toISOString(), messages: [] });

function readThreads(): Thread[] {
  try {
    const t = JSON.parse(window.localStorage.getItem(STORE) ?? "[]") as Thread[];
    return Array.isArray(t) ? t.slice(0, 30) : [];
  } catch {
    return [];
  }
}

/** Markdown-lite → React (no HTML injection). Only MunchReach links are clickable. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] && m[2]) {
      out.push(
        isAllowedLink(m[2]) ? (
          <a key={m.index} href={m[2]} className="font-medium text-primary underline underline-offset-2">{m[1]}</a>
        ) : (
          m[1]
        ),
      );
    } else if (m[3]) out.push(<strong key={m.index}>{m[3]}</strong>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*([-*]|\d+[.)])\s+/.test(l))) {
          const ordered = /^\s*\d/.test(lines[0] ?? "");
          const items = lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*]|\d+[.)])\s+/, ""))}</li>);
          return ordered ? <ol key={i} className="list-decimal space-y-1 pl-5">{items}</ol> : <ul key={i} className="list-disc space-y-1 pl-5">{items}</ul>;
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>{j > 0 ? <br /> : null}{inline(l.replace(/^#+\s*/, ""))}</Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export default function MunchMateChat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const chat = useServerFn(munchmateChat);
  const guestTicket = useServerFn(createMunchmateGuestTicket);
  const userTicket = useServerFn(createMunchmateTicket);

  const [threads, setThreads] = useState<Thread[]>(() => {
    const t = readThreads();
    return t.length ? t : [newThread()];
  });
  const [activeId, setActiveId] = useState(() => threads[0]!.id);
  const [view, setView] = useState<"chat" | "list" | "ticket">("chat");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const active = threads.find((t) => t.id === activeId) ?? threads[0]!;

  const commit = (next: Thread[]) => {
    setThreads(next);
    try {
      window.localStorage.setItem(STORE, JSON.stringify(next.slice(0, 30)));
    } catch {
      /* storage full or blocked */
    }
  };
  const updateActive = (fn: (t: Thread) => Thread) =>
    setThreads((prev) => {
      const next = prev.map((t) => (t.id === activeId ? fn(t) : t));
      try {
        window.localStorage.setItem(STORE, JSON.stringify(next.slice(0, 30)));
      } catch {
        /* ignore */
      }
      return next;
    });

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);
  useEffect(() => {
    if (open && view === "chat") inputRef.current?.focus();
  }, [open, view, activeId, busy]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [active.messages.length, busy, view]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function send(text: string) {
    const content = text.trim().slice(0, 2000);
    if (!content || busy) return;
    setInput("");
    const userMsg: Msg = { id: uid(), role: "user", content, at: new Date().toISOString() };
    const history = [...active.messages, userMsg];
    updateActive((t) => ({
      ...t,
      title: t.messages.length === 0 ? content.slice(0, 60) : t.title,
      updatedAt: userMsg.at,
      messages: history,
    }));
    setBusy(true);
    try {
      const r = await chat({ data: { messages: history.map((m) => ({ role: m.role, content: m.content })) } });
      updateActive((t) => ({
        ...t,
        messages: [...t.messages, { id: uid(), role: "assistant", content: r.reply, at: new Date().toISOString(), sources: r.sources, offerTicket: r.offerTicket }],
      }));
    } catch (e) {
      updateActive((t) => ({
        ...t,
        messages: [...t.messages, { id: uid(), role: "assistant", content: (e as Error).message || "Something went wrong. Please try again.", at: new Date().toISOString(), offerTicket: true }],
      }));
    } finally {
      setBusy(false);
    }
  }

  const startNew = () => {
    const t = newThread();
    commit([t, ...threads.filter((x) => x.messages.length > 0)]);
    setActiveId(t.id);
    setView("chat");
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="MunchMate chat"
      className="munchmate-msg fixed inset-x-2 bottom-2 z-[61] flex h-[min(640px,calc(100dvh-1rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[390px]"
    >
      <header className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-mascot-body to-mascot-glow px-4 py-3 text-primary-foreground">
        <span className="rounded-full bg-primary-foreground/15 p-0.5"><MunchMateMascot size={36} happy={busy} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">MunchMate</p>
          <p className="truncate text-xs opacity-90">Your MunchReach AI Assistant</p>
        </div>
        <button type="button" onClick={() => setView(view === "list" ? "chat" : "list")} className="rounded-md p-1.5 hover:bg-primary-foreground/15" aria-label="Conversations"><List className="size-4" /></button>
        <button type="button" onClick={startNew} className="rounded-md p-1.5 hover:bg-primary-foreground/15" aria-label="Start new conversation"><Plus className="size-4" /></button>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 hover:bg-primary-foreground/15" aria-label="Minimize chat"><Minus className="size-4" /></button>
        <button
          type="button"
          onClick={() => {
            startNew();
            onClose();
          }}
          className="rounded-md p-1.5 hover:bg-primary-foreground/15"
          aria-label="Close and end conversation"
        >
          <X className="size-4" />
        </button>
      </header>

      {view === "list" ? (
        <div className="flex-1 overflow-y-auto p-2">
          {threads.map((t) => (
            <div key={t.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${t.id === activeId ? "bg-accent" : "hover:bg-muted"}`}>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setActiveId(t.id); setView("chat"); }}>
                <p className="truncate font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground">{new Date(t.updatedAt).toLocaleString()}{t.ticketRef ? ` · Ticket ${t.ticketRef}` : ""}</p>
              </button>
              <button
                type="button"
                aria-label={`Delete ${t.title}`}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  const rest = threads.filter((x) => x.id !== t.id);
                  const next = rest.length ? rest : [newThread()];
                  commit(next);
                  if (t.id === activeId) setActiveId(next[0]!.id);
                }}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : view === "ticket" ? (
        <TicketForm
          signedIn={signedIn}
          thread={active}
          onBack={() => setView("chat")}
          submit={async (payload) => {
            const conversation = active.messages.map((m) => ({ role: m.role, content: m.content, at: m.at }));
            const r = signedIn
              ? await userTicket({ data: { ...payload, conversation } })
              : await guestTicket({ data: { ...payload, email: payload.email ?? "", conversation } });
            updateActive((t) => ({
              ...t,
              ticketRef: r.ticketRef,
              messages: [
                ...t.messages,
                {
                  id: uid(),
                  role: "assistant",
                  at: new Date().toISOString(),
                  content: `Your ticket **${r.ticketRef}** was created. Our support team will reply ${signedIn ? "in [Support](/support) and by notification" : "by email"}.`,
                },
              ],
            }));
            setView("chat");
          }}
        />
      ) : (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm" aria-live="polite">
            <Bubble role="assistant"><RichText text={GREETING} /></Bubble>
            {active.messages.length === 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary hover:text-primary">
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
            {active.messages.map((m) => (
              <div key={m.id} className="munchmate-msg space-y-2">
                <Bubble role={m.role}><RichText text={m.content} /></Bubble>
                {m.role === "assistant" && m.sources?.length ? (
                  <div className="space-y-1.5">
                    {m.sources.map((s) => (
                      <a key={s.url} href={s.url} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs transition-colors hover:border-primary">
                        <ExternalLink className="size-3.5 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-foreground">{s.title}</span>
                          <span className="block truncate text-muted-foreground">munchreach.com{s.url}</span>
                        </span>
                      </a>
                    ))}
                  </div>
                ) : null}
                {m.role === "assistant" ? (
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <button type="button" aria-label="Helpful" aria-pressed={m.feedback === "up"} className={`rounded p-1 hover:text-foreground ${m.feedback === "up" ? "text-primary" : ""}`} onClick={() => updateActive((t) => ({ ...t, messages: t.messages.map((x) => (x.id === m.id ? { ...x, feedback: "up" } : x)) }))}><ThumbsUp className="size-3.5" /></button>
                    <button type="button" aria-label="Not helpful" aria-pressed={m.feedback === "down"} className={`rounded p-1 hover:text-foreground ${m.feedback === "down" ? "text-destructive" : ""}`} onClick={() => updateActive((t) => ({ ...t, messages: t.messages.map((x) => (x.id === m.id ? { ...x, feedback: "down", offerTicket: true } : x)) }))}><ThumbsDown className="size-3.5" /></button>
                    {m.offerTicket && !active.ticketRef ? (
                      <>
                        <button type="button" onClick={() => setView("ticket")} className="ml-1 rounded-full border border-border px-2.5 py-1 font-medium text-foreground hover:border-primary">Create Support Ticket</button>
                        <button type="button" onClick={() => setView("ticket")} className="rounded-full border border-border px-2.5 py-1 font-medium text-foreground hover:border-primary">Talk to Human Support</button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            {busy ? (
              <Bubble role="assistant">
                <span className="flex gap-1 py-1" aria-label="MunchMate is typing">
                  {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </span>
              </Bubble>
            ) : null}
            <div ref={endRef} />
          </div>
          <form
            className="flex items-end gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={2000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Ask about MunchReach…"
              aria-label="Message MunchMate"
              className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send message" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-50">
              <Send className="size-4" />
            </button>
          </form>
          <p className="px-3 pb-2 text-center text-[11px] text-muted-foreground">
            AI answers can be wrong. <button type="button" className="underline" onClick={() => setView("ticket")}>Contact support</button>
          </p>
        </>
      )}
    </div>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: ReactNode }) {
  return role === "user" ? (
    <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-primary-foreground">{children}</div>
  ) : (
    <div className="max-w-[92%] text-foreground">{children}</div>
  );
}

type TicketPayload = {
  subject: string;
  description: string;
  category: (typeof SUPPORT_CATEGORIES)[number];
  priority: (typeof SUPPORT_PRIORITIES)[number];
  email?: string;
  name?: string;
};

function TicketForm({ signedIn, thread, onBack, submit }: { signedIn: boolean; thread: Thread; onBack: () => void; submit: (p: TicketPayload) => Promise<void> }) {
  const lastUser = [...thread.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const [f, setF] = useState<TicketPayload>({
    subject: lastUser.slice(0, 120),
    description: lastUser,
    category: "other",
    priority: "normal" as TicketPayload["priority"],
    email: "",
    name: "",
  });
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const field = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <form
      className="flex-1 space-y-3 overflow-y-auto p-4 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setSending(true);
        try {
          await submit(f);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setSending(false);
        }
      }}
    >
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Back to chat</button>
      <p className="flex items-center gap-2 font-semibold"><LifeBuoy className="size-4 text-primary" /> Create a support ticket</p>
      <p className="text-xs text-muted-foreground">A human will reply. This conversation is attached to your ticket.</p>
      {!signedIn ? (
        <>
          <label className="block space-y-1"><span className="text-xs font-medium">Your email</span><input required type="email" className={field} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="block space-y-1"><span className="text-xs font-medium">Name (optional)</span><input className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        </>
      ) : null}
      <label className="block space-y-1"><span className="text-xs font-medium">Subject</span><input required minLength={4} maxLength={160} className={field} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1"><span className="text-xs font-medium">Category</span>
          <select className={field} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as TicketPayload["category"] })}>
            {SUPPORT_CATEGORIES.map((c) => <option key={c} value={c}>{SUPPORT_CATEGORY_LABEL[c] ?? c}</option>)}
          </select>
        </label>
        <label className="block space-y-1"><span className="text-xs font-medium">Priority</span>
          <select className={field} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as TicketPayload["priority"] })}>
            {SUPPORT_PRIORITIES.map((p) => <option key={p} value={p}>{SUPPORT_PRIORITY_LABEL[p] ?? p}</option>)}
          </select>
        </label>
      </div>
      <label className="block space-y-1"><span className="text-xs font-medium">Description</span><textarea required minLength={10} maxLength={8000} rows={5} className={field} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      {signedIn ? <p className="text-xs text-muted-foreground">Need to attach a file? Add it from <a href="/support" className="text-primary underline">Support</a> after the ticket is created.</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <button type="submit" disabled={sending} className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60">{sending ? "Creating…" : "Create ticket"}</button>
    </form>
  );
}
