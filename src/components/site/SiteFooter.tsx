import { Link } from "@tanstack/react-router";
import { Send } from "lucide-react";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Campaigns", to: "/product/campaigns" },
      { label: "Unified Inbox", to: "/product/unified-inbox" },
      { label: "Follow-Ups", to: "/product/follow-ups" },
      { label: "Warmup", to: "/product/warmup" },
      { label: "CRM", to: "/product/crm" },
      { label: "Analytics", to: "/product/analytics" },
      { label: "Workspaces", to: "/product/workspaces" },
      { label: "Templates", to: "/product/templates" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", to: "/blog" },
      { label: "Documentation", to: "/docs" },
      { label: "API Documentation", to: "/api-docs" },
      { label: "Deliverability Guide", to: "/deliverability-guide" },
      { label: "Cold Email Templates", to: "/cold-email-templates" },
      { label: "Help Center", to: "/help-center" },
      { label: "Integrations", to: "/integrations" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "Contact", to: "/contact" },
      { label: "Pricing", to: "/pricing" },
      { label: "Customer Reviews", to: "/customer-reviews" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Terms of Service", to: "/terms" },
      { label: "Acceptable Use Policy", to: "/acceptable-use" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-card/30">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Send className="size-4" />
            </span>
            <span className="text-base font-bold tracking-tight">Sendloop</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Send personalized cold emails, automate follow-ups, and manage every reply from one
            workspace.
          </p>
          <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
            {["LinkedIn", "YouTube", "X", "Facebook"].map((s) => (
              <a key={s} href="#top" className="transition-colors hover:text-foreground">
                {s}
              </a>
            ))}
          </div>
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-semibold">{col.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.to}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Sendloop. All rights reserved.
      </div>
    </footer>
  );
}
