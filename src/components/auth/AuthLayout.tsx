import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Send } from "lucide-react";

import { AuthWorkflowVisual } from "@/components/auth/AuthWorkflowVisual";

/**
 * Split auth layout: animated product workflow on the left, form on the right.
 * On mobile the workflow collapses into a compact top strip.
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
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden border-r border-border bg-sidebar lg:block">
        <div className="absolute left-10 top-8 z-10 xl:left-14">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Send className="size-4" />
            </span>
            <span className="text-lg font-bold tracking-tight">Sendloop</span>
          </Link>
        </div>
        <AuthWorkflowVisual />
      </aside>

      <main className="flex items-center justify-center px-5 py-12 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-sm"
        >
          <Link to="/" className="mb-8 inline-flex items-center gap-2 lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Send className="size-4" />
            </span>
            <span className="text-base font-bold tracking-tight">Sendloop</span>
          </Link>

          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}

          <div className="mt-8">{children}</div>

          {footer ? <div className="mt-6 text-sm text-muted-foreground">{footer}</div> : null}
        </motion.div>
      </main>
    </div>
  );
}
