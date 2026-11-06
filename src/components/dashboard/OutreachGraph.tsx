import { motion } from "framer-motion";
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

export type SeriesPoint = {
  date: string;
  sent: number;
  delivered: number;
  replies: number;
  positive: number;
  meetings: number;
};

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

const LINES = [
  { key: "sent", label: "Emails sent", color: "var(--chart-1)" },
  { key: "delivered", label: "Confirmed delivered", color: "var(--chart-5)" },
  { key: "replies", label: "Replies", color: "var(--chart-2)" },
  { key: "positive", label: "Positive replies", color: "var(--chart-3)" },
  { key: "meetings", label: "Meetings", color: "var(--chart-4)" },
] as const;

function shortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Interactive outreach performance chart driven entirely by workspace data. */
export function OutreachGraph({
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
  const hasData = data.some((p) => p.sent || p.delivered || p.replies || p.positive || p.meetings);

  return (
    <div className="surface-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Outreach performance</h3>
          <p className="text-xs text-muted-foreground">
            Sends, replies and booked meetings across the selected window.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {RANGES.map((range) => (
            <Button
              key={range.days}
              size="sm"
              variant={days === range.days ? "secondary" : "ghost"}
              className="h-7 px-3 text-xs"
              onClick={() => onDaysChange(range.days)}
            >
              {range.label}
            </Button>
          ))}
        </div>
      </div>

      <motion.div
        key={days}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="mt-6 h-72"
      >
        {loading ? (
          <div className="h-full animate-pulse rounded-lg bg-muted/60" />
        ) : hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
              <defs>
                {LINES.map((line) => (
                  <linearGradient key={line.key} id={`fill-${line.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={line.color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={line.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip
                labelFormatter={(value) => shortDate(String(value))}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.6rem",
                  color: "var(--popover-foreground)",
                  fontSize: "12px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              {LINES.map((line) => (
                <Area
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  name={line.label}
                  stroke={line.color}
                  strokeWidth={2}
                  fill={`url(#fill-${line.key})`}
                  animationDuration={900}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
            <p className="text-sm font-medium">No outreach activity yet</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Launch a campaign and this graph will fill in with your real sends, replies and
              meetings.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
