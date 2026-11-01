import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, ArrowUp, ExternalLink, Flame, Inbox, LayoutList, LifeBuoy, List, Mail, Minus, Plus, Rocket, ShieldCheck, ThumbsDown, ThumbsUp, Upload, X,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { createMunchmateGuestTicket, createMunchmateTicket, munchmateChat } from "@/lib/munchmate.functions";
import { isAllowedLink } from "@/lib/munchmate/retrieval";
import { CHAT_ERROR, compactHistory, LONG_MESSAGE_ERROR, MESSAGE_LIMIT } from "@/lib/munchmate/context";
import { SUPPORT_CATEGORIES, SUPPORT_CATEGORY_LABEL, SUPPORT_PRIORITIES, SUPPORT_PRIORITY_LABEL } from "@/lib/support-model";
import { MunchMateMascot, type MascotMood } from "./MunchMateMascot";

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
/** Label shown on the card → question actually sent (unchanged prompts for retrieval). */
const SUGGESTIONS: Array<{ label: string; q: string; icon: LucideIcon }> = [
  { label: "Create my first campaign", q: "How do I create my first campaign?", icon: Rocket },
  { label: "Set up email warmup", q: "How does email warmup work?", icon: Flame },
  { label: "Connect my mailbox", q: "How do I connect my mailbox?", icon: Mail },
  { label: "Improve deliverability", q: "How can I improve email deliverability?", icon: ShieldCheck },
  { label: "Import leads", q: "How do I import leads?", icon: Upload },
  { label: "Explore Unibox", q: "How does Unibox work?", icon: Inbox },
  { label: "Manage campaigns", q: "How do I manage my campaigns?", icon: LayoutList },
];
/** Occasional, light personality while waiting — never added to answers. */
const THINKING_LINES = ["Let's figure this out!", "Aha, I know where to look.", "One second, let me check the help docs.", "No worries, we've got this."];
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

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
  // Group consecutive list lines so mixed paragraphs + steps render cleanly.
  const LIST = /^\s*([-*•]|\d+[.)])\s+/;
  const groups: Array<{ kind: "p" | "ol" | "ul"; lines: string[] }> = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      groups.push({ kind: "p", lines: [] });
      continue;
    }
    const kind = LIST.test(line) ? (/^\s*\d/.test(line) ? "ol" : "ul") : "p";
    const last = groups[groups.length - 1];
    if (last && last.kind === kind && (kind !== "p" || last.lines.length)) last.lines.push(line);
    else groups.push({ kind, lines: [line] });
  }
  return (
    <div className="space-y-2">
      {groups.filter((g) => g.lines.length).map((g, i) => {
        if (g.kind !== "p") {
          const items = g.lines.map((l, j) => <li key={j} className="pl-0.5">{inline(l.replace(LIST, ""))}</li>);
          return g.kind === "ol"
            ? <ol key={i} className="list-decimal space-y-1 pl-5 marker:font-semibold marker:text-primary">{items}</ol>
            : <ul key={i} className="list-disc space-y-1 pl-5 marker:text-primary">{items}</ul>;
        }
        return (
          <p key={i}>
            {g.lines.map((l, j) => (
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
  const [thinkingLine, setThinkingLine] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(0);
  const mood: MascotMood | undefined = celebrate ? "happy" : busy ? "thinking" : undefined;
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
    const content = text;
    if (!content || busy) return;
    if (content.length > MESSAGE_LIMIT) {
      updateActive((t) => ({ ...t, messages: [...t.messages, { id: uid(), role: "assistant", content: LONG_MESSAGE_ERROR, at: new Date().toISOString() }] }));
      return;
    }
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
    setThinkingLine(Math.random() < 0.35 ? THINKING_LINES[Math.floor(Math.random() * THINKING_LINES.length)]! : null);
    try {
      const r = await chat({ data: { messages: compactHistory(history) } });
      updateActive((t) => ({
        ...t,
        messages: [...t.messages, { id: uid(), role: "assistant", content: r.reply, at: new Date().toISOString(), sources: r.sources, offerTicket: r.offerTicket }],
      }));
    } catch {
      updateActive((t) => ({
        ...t,
        messages: [...t.messages, { id: uid(), role: "assistant", content: CHAT_ERROR, at: new Date().toISOString(), offerTicket: true }],
      }));
    } finally {
      setBusy(false);
    }
  }

  const cheer = () => {
    setCelebrate(Date.now());
    window.setTimeout(() => setCelebrate(0), 1800);
  };

  const startNew = () => {
    const t = newThread();
    commit([t, ...threads.filter((x) => x.messages.length > 0)]);
    setActiveId(t.id);
    setView("chat");
  };

  if (!open) return null;

  const iconBtn = "rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  const empty = active.messages.length === 0;

  return (
    <div
      role="dialog"
      aria-label="MunchMate chat"
      className="munchmate-msg fixed inset-x-2 bottom-2 z-[61] flex h-[min(660px,calc(100dvh-1rem))] flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[400px]"
    >
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className={`relative flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent ${celebrate ? "munchmate-cheer" : ""}`}>
          <MunchMateMascot size={38} mood={mood} lively={!busy} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-foreground">MunchMate</p>
          <p className="text-xs text-muted-foreground">Your MunchReach sidekick</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-success">
            <span className="size-1.5 rounded-full bg-success shadow-[0_0_0_3px] shadow-success/20" /> Online
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => setView(view === "list" ? "chat" : "list")} className={iconBtn} aria-label="Conversations"><List className="size-4" /></button>
          <button type="button" onClick={startNew} className={iconBtn} aria-label="Start new conversation"><Plus className="size-4" /></button>
          <button type="button" onClick={onClose} className={iconBtn} aria-label="Minimize chat"><Minus className="size-4" /></button>
          <button
            type="button"
            onClick={() => {
              startNew();
              onClose();
            }}
            className={iconBtn}
            aria-label="Close and end conversation"
          >
            <X className="size-4" />
          </button>
        </div>
      </header>

      {view === "list" ? (
        <div className="flex-1 overflow-y-auto p-2">
          {threads.map((t) => (
            <div key={t.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${t.id === activeId ? "bg-accent" : "hover:bg-muted"}`}>
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
          <div className="flex-1 overflow-y-auto bg-muted/40 px-4 py-4 text-sm" aria-live="polite">
            {empty ? (
              <div className="munchmate-msg space-y-4">
                <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <span className="shrink-0"><MunchMateMascot size={56} mood="happy" /></span>
                  <div className="min-w-0 space-y-1.5">
                    <p className="font-semibold text-foreground">Hey there! 👋 I'm MunchMate.</p>
                    <p className="leading-relaxed text-muted-foreground">
                      Your MunchReach sidekick. Need help with a campaign, email warmup, or finding your way around?{" "}
                      <span className="font-medium text-primary">I'm all ears!</span>
                    </p>
                  </div>
                </div>
                <div>
                  <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Popular questions</p>
                  <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                    {SUGGESTIONS.map(({ label, q, icon: Icon }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => void send(q)}
                        className="group flex items-center gap-2 rounded-xl border border-primary/15 bg-accent/70 px-3 py-2.5 text-left text-xs font-medium text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent hover:shadow-sm"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-card text-primary shadow-sm transition-transform group-hover:scale-110">
                          <Icon className="size-3.5" />
                        </span>
                        <span className="leading-snug">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {active.messages.map((m) => (
                  <div key={m.id} className="munchmate-msg">
                    {m.role === "user" ? (
                      <div className="flex flex-col items-end gap-1">
                        <div className="w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-primary-foreground shadow-sm">{m.content}</div>
                        <span className="pr-1 text-[10px] text-muted-foreground">{timeLabel(m.at)}</span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <Avatar />
                        <div className="min-w-0 max-w-[85%] space-y-2">
                          <div className="rounded-2xl rounded-tl-md border border-border bg-card px-3.5 py-2.5 leading-relaxed text-foreground shadow-sm">
                            <RichText text={m.content} />
                          </div>
                          {m.sources?.length ? (
                            <div className="space-y-1.5">
                              {m.sources.map((s) => (
                                <a key={s.url} href={s.url} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs transition-colors hover:border-primary">
                                  <ExternalLink className="size-3.5 shrink-0 text-primary" />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium text-foreground">{s.title}</span>
                                    <span className="block truncate text-muted-foreground">munchreach.com{s.url}</span>
                                  </span>
                                </a>
                              ))}
                            </div>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                            <span className="mr-1">{timeLabel(m.at)}</span>
                            <button type="button" aria-label="Helpful" aria-pressed={m.feedback === "up"} className={`rounded p-1 hover:text-foreground ${m.feedback === "up" ? "text-primary" : ""}`} onClick={() => { if (m.feedback !== "up") cheer(); updateActive((t) => ({ ...t, messages: t.messages.map((x) => (x.id === m.id ? { ...x, feedback: "up" } : x)) })); }}><ThumbsUp className="size-3.5" /></button>
                            <button type="button" aria-label="Not helpful" aria-pressed={m.feedback === "down"} className={`rounded p-1 hover:text-foreground ${m.feedback === "down" ? "text-destructive" : ""}`} onClick={() => updateActive((t) => ({ ...t, messages: t.messages.map((x) => (x.id === m.id ? { ...x, feedback: "down", offerTicket: true } : x)) }))}><ThumbsDown className="size-3.5" /></button>
                            {m.feedback === "up" ? <span className="text-primary">Mission accomplished! 🎉</span> : null}
                          </div>
                          {m.offerTicket && !active.ticketRef ? (
                            <div className="flex flex-wrap gap-1.5 text-xs">
                              <button type="button" onClick={() => setView("ticket")} className="rounded-full border border-border bg-card px-2.5 py-1 font-medium text-foreground hover:border-primary">Create Support Ticket</button>
                              <button type="button" onClick={() => setView("ticket")} className="rounded-full border border-border bg-card px-2.5 py-1 font-medium text-foreground hover:border-primary">Talk to Human Support</button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {busy ? (
                  <div className="munchmate-msg flex items-start gap-2">
                    <Avatar mood="thinking" />
                    <div className="rounded-2xl rounded-tl-md border border-border bg-card px-3.5 py-2.5 shadow-sm">
                      {thinkingLine ? <p className="mb-1 text-xs text-muted-foreground">{thinkingLine}</p> : null}
                      <span className="flex gap-1 py-1" aria-label="MunchMate is typing">
                        {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: `${i * 0.15}s` }} />)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="border-t border-border bg-card px-3 pb-2 pt-3">
            <form
              className="flex items-end gap-2 rounded-2xl border border-input bg-background p-1.5 pl-3 transition-shadow focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/30"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                maxLength={MESSAGE_LIMIT}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder="Ask MunchMate anything..."
                aria-label="Message MunchMate"
                className="max-h-28 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm focus-visible:outline-none"
              />
              <button type="submit" disabled={busy || !input.trim()} aria-label="Send message" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-all hover:brightness-105 disabled:opacity-40">
                <ArrowUp className="size-4" />
              </button>
            </form>
            <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-muted-foreground">
              <span>Powered by MunchReach AI · answers can be wrong</span>
              <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setView("ticket")}>
                <LifeBuoy className="size-3" /> Contact support
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Avatar({ mood }: { mood?: MascotMood }) {
  return (
    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-accent">
      <MunchMateMascot size={22} mood={mood} />
    </span>
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
        } catch {
          setError("I couldn't create your support ticket. Please check the details and try again.");
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
