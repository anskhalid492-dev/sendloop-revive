import { motion } from "framer-motion";
import { LineChart as LineChartIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/command/primitives";
import type { SeriesPoint } from "@/lib/dashboard-command-model";

const RANGES = [7, 30, 90] as const;

const LINES = [
  { key: "sent", label: "Emails sent", color: "var(--chart-1)" },
  { key: "delivered", label: "Delivered", color: "var(--chart-5)" },
  { key: "replies", label: "Replies", color: "var(--chart-2)" },
  { key: "positive", label: "Positive replies", color: "var(--chart-3)" },
  { key: "meetings", label: "Meetings booked", color: "var(--chart-4)" },
] as const;

function shortDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Outbound activity over time — real campaign events only. */
export function ActivityChart({
  data,
  days,
  onDaysChange,
  loading,
}: {
  data: SeriesPoint[];
  days: number;
  onDaysChange: (days: number) => void;
  loading: boolean;
}) {
  const hasData = data.some(
    (p) => p.sent || p.delivered || p.replies || p.positive || p.meetings,
  );

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight">Outbound activity</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sends, deliveries, replies and meetings across the selected window.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {RANGES.map((range) => (
            <Button
              key={range}
              size="sm"
              variant={days === range ? "secondary" : "ghost"}
              className="h-7 px-3 text-xs"
              onClick={() => onDaysChange(range)}
            >
              {range} days
            </Button>
          ))}
        </div>
      </header>

      <motion.div
        key={days}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
        className="h-[340px] px-3 py-5"
      >
        {loading ? (
          <div className="h-full animate-pulse rounded-lg bg-muted/60" />
        ) : hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
              <defs>
                {LINES.map((line) => (
                  <linearGradient key={line.key} id={`cc-${line.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={line.color} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={line.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={44}
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <Tooltip
                labelFormatter={(v) => shortDate(String(v))}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 12,
                  color: "var(--popover-foreground)",
                }}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              />
              {LINES.map((line) => (
                <Area
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  name={line.label}
                  stroke={line.color}
                  strokeWidth={2}
                  fill={`url(#cc-${line.key})`}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={LineChartIcon}
            title="No outbound activity yet"
            body="Once your campaigns start sending, daily volume, deliveries and replies appear here."
            ctaLabel="Create campaign"
            to="/campaigns"
          />
        )}
      </motion.div>
    </div>
  );
}
