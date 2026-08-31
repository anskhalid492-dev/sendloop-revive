import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Inbox, Mailbox, Repeat, ShieldCheck, Sparkles } from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { BRAND_NAME } from "@/lib/branding";

const BENEFITS = [
  {
    icon: Mailbox,
    title: "Multi-mailbox outreach",
    copy: "Send from many mailboxes with per-mailbox limits and rotation.",
  },
  {
    icon: Repeat,
    title: "Sequences & follow-ups",
    copy: "Automated multi-step follow-ups that stop the moment someone replies.",
  },
  {
    icon: Sparkles,
    title: "AI personalization",
    copy: "Personalized opening lines generated for every lead in your list.",
  },
  {
    icon: ShieldCheck,
    title: "Warmup & deliverability",
    copy: "Built-in warmup, domain checks and sending health monitoring.",
  },
  {
    icon: Inbox,
    title: "Unified inbox & analytics",
    copy: "Every reply and every metric in one place, per workspace.",
  },
];

/** Left-hand product introduction panel. */
function ProductPanel() {
  return (
    <div className="relative overflow-hidden bg-[color-mix(in_oklab,var(--primary)_7%,var(--background))] lg:min-h-screen">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-24 size-[420px] rounded-full opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 32%, transparent), transparent)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 right-0 size-[380px] rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 22%, transparent), transparent)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative flex h-full flex-col px-6 py-10 sm:px-10 lg:px-14 lg:py-14">
        <Link to="/" className="inline-flex items-center" aria-label={BRAND_NAME}>
          <BrandLogo context="login" className="h-9 max-w-[210px]" />
        </Link>

        <div className="mt-10 lg:mt-16">
          <motion.h2
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-[16ch] text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground sm:text-[2.5rem]"
          >
            Turn cold outreach into predictable growth.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="mt-4 max-w-[46ch] text-[0.975rem] leading-relaxed text-muted-foreground"
          >
            {BRAND_NAME} is an all-in-one cold outbound platform — leads, mailboxes, sequences,
            deliverability and replies handled in a single workspace.
          </motion.p>
        </div>

        <ul className="mt-10 max-w-md space-y-3">
          {BENEFITS.map((benefit, i) => (
            <motion.li
              key={benefit.title}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.15 + i * 0.08, ease: "easeOut" }}
              className="flex items-start gap-3.5 rounded-xl border border-border/60 bg-card/70 px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] backdrop-blur-sm"
            >
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                <benefit.icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{benefit.title}</span>
                <span className="mt-0.5 block text-[0.8rem] leading-relaxed text-muted-foreground">
                  {benefit.copy}
                </span>
              </span>
            </motion.li>
          ))}
        </ul>

        {/* Subtle workflow illustration */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-10 hidden max-w-md items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-3 backdrop-blur-sm lg:flex"
        >
          {["Leads", "Sequence", "Send", "Reply", "Pipeline"].map((step, i, arr) => (
            <span key={step} className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-[0.72rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {step}
              </span>
              {i < arr.length - 1 ? (
                <span
                  aria-hidden
                  className="h-px flex-1 bg-gradient-to-r from-primary/50 to-primary/10"
                />
              ) : null}
            </span>
          ))}
        </motion.div>

        <div className="mt-auto pt-10 text-xs text-muted-foreground">
          © {new Date().getFullYear()} {BRAND_NAME}
          <span className="mx-2 text-border">•</span>
          <Link to="/terms" className="transition-colors hover:text-foreground">
            Terms
          </Link>
          <span className="mx-2 text-border">•</span>
          <Link to="/privacy" className="transition-colors hover:text-foreground">
            Privacy
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Two-panel auth shell: product introduction on the left, authentication on the
 * right. Stacks vertically on mobile. Purely presentational — auth logic lives
 * in the route components.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string | undefined;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[1.05fr_1fr]">
      <ProductPanel />

      <div className="relative flex items-center justify-center px-5 py-12 sm:px-10 lg:py-16">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[460px]"
        >
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[2rem]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-3 max-w-[42ch] text-[0.95rem] leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          ) : null}

          <div className="mt-8">{children}</div>

          {footer ? (
            <div className="mt-7 text-sm text-muted-foreground">{footer}</div>
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}
