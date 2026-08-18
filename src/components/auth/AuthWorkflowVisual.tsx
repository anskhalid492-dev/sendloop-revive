import { motion } from "framer-motion";
import { CalendarCheck, Mail, MessageSquareReply, Repeat, Send, UserPlus } from "lucide-react";

const STAGES = [
  { key: "lead", label: "Lead added", meta: "1,240 prospects", icon: UserPlus },
  { key: "campaign", label: "Campaign", meta: "SaaS founders", icon: Send },
  { key: "sent", label: "Email sent", meta: "Day 0", icon: Mail },
  { key: "followup", label: "Follow-up", meta: "Day 3", icon: Repeat },
  { key: "reply", label: "Reply", meta: "Interested", icon: MessageSquareReply },
  { key: "crm", label: "CRM", meta: "Meeting booked", icon: CalendarCheck },
];

const METRICS = [
  { label: "Reply rate", value: "8.4%" },
  { label: "Meetings", value: "27" },
  { label: "Deliverability", value: "99%" },
];

/**
 * CSS/Framer-only motion graphic of the Sendloop workflow. No images, no
 * canvas — it animates the same pipeline the product runs.
 */
export function AuthWorkflowVisual() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
          backgroundSize: "38px 38px",
        }}
      />

      {[0, 1, 2, 3, 4, 5].map((i) => (
        <motion.span
          key={i}
          aria-hidden
          className="pointer-events-none absolute size-1.5 rounded-full bg-primary/40"
          style={{ left: `${8 + i * 16}%`, top: "100%" }}
          animate={{ y: [0, -680], opacity: [0, 0.8, 0] }}
          transition={{ duration: 14 + i * 2, repeat: Infinity, delay: i * 2, ease: "linear" }}
        />
      ))}

      <motion.span
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/3 size-72 rounded-full bg-primary/20 blur-3xl"
        animate={{ x: [0, 60, 0], y: [0, -40, 0], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative flex h-full flex-col justify-center px-10 py-12 xl:px-14">
        <motion.h2
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md text-3xl font-bold leading-tight tracking-tight"
        >
          Turn cold outreach into a predictable pipeline.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-3 max-w-md text-sm text-muted-foreground"
        >
          Every lead flows through campaigns, follow-ups and replies into your CRM — automatically.
        </motion.p>

        <ol className="relative mt-9 max-w-sm space-y-2.5">
          <span
            aria-hidden
            className="absolute left-[22px] top-4 bottom-4 w-px bg-gradient-to-b from-primary/50 via-primary/25 to-transparent"
          />
          <motion.span
            aria-hidden
            className="absolute left-[19px] size-1.5 rounded-full bg-primary shadow-[0_0_10px_2px_var(--primary)]"
            animate={{ top: ["6%", "92%"], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />

          {STAGES.map((stage, i) => (
            <motion.li
              key={stage.key}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.25 + i * 0.12, ease: "easeOut" }}
              className="relative flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/80 px-4 py-3 text-sm shadow-sm backdrop-blur"
            >
              <span className="flex items-center gap-3">
                <span className="relative flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <stage.icon className="size-3.5" />
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-lg border border-primary/50"
                    animate={{ opacity: [0, 0.9, 0], scale: [0.9, 1.25, 1.25] }}
                    transition={{ duration: 6, repeat: Infinity, delay: i * 1 }}
                  />
                </span>
                <span className="font-medium">{stage.label}</span>
              </span>
              <span className="text-xs text-muted-foreground">{stage.meta}</span>
            </motion.li>
          ))}
        </ol>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.1 }}
          className="mt-8 grid max-w-sm grid-cols-3 gap-3"
        >
          {METRICS.map((metric) => (
            <div
              key={metric.label}
              className="rounded-xl border border-border/70 bg-card/70 px-3 py-2.5 backdrop-blur"
            >
              <div className="text-base font-semibold">{metric.value}</div>
              <div className="text-[11px] text-muted-foreground">{metric.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
