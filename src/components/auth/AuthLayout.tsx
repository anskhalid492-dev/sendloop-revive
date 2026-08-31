import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { BRAND_NAME } from "@/lib/branding";

/**
 * Premium, conversion-focused auth shell.
 *
 * Single centered column on a quiet gradient canvas: brand mark, headline,
 * supporting line, then the form. No decorative panels, cards-in-cards or
 * marketing filler — the page exists to get the visitor authenticated.
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
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Soft brand gradients — kept low contrast so text stays crisp. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 40%, color-mix(in oklab, var(--primary) 22%, transparent), transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-56 opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(45% 100% at 50% 100%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 70%)",
        }}
      />

      <header className="relative z-10 px-5 pt-8 sm:px-10">
        <Link to="/" className="inline-flex items-center" aria-label={BRAND_NAME}>
          <BrandLogo context="login" className="h-8 max-w-[190px] sm:h-9 sm:max-w-[210px]" />
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-5 py-12 sm:px-8 sm:py-16">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[420px]"
        >
          <div className="text-center">
            <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[2rem]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mx-auto mt-3 max-w-[36ch] text-[0.95rem] leading-relaxed text-muted-foreground">
                {subtitle}
              </p>
            ) : null}
          </div>

          <div className="mt-8 rounded-2xl border border-border/70 bg-card/80 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_50px_-24px_color-mix(in_oklab,var(--primary)_35%,transparent)] backdrop-blur-sm sm:p-8">
            {children}
          </div>

          {footer ? (
            <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
          ) : null}
        </motion.div>
      </main>

      <footer className="relative z-10 px-5 pb-8 text-center text-xs text-muted-foreground sm:px-10">
        <span>
          © {new Date().getFullYear()} {BRAND_NAME}
        </span>
        <span className="mx-2 text-border">•</span>
        <Link to="/terms" className="transition-colors hover:text-foreground">
          Terms
        </Link>
        <span className="mx-2 text-border">•</span>
        <Link to="/privacy" className="transition-colors hover:text-foreground">
          Privacy
        </Link>
      </footer>
    </div>
  );
}
