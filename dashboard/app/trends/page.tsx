"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { api, Trends } from "@/lib/api";
import MetricCard from "../components/MetricCard";

function HorizontalBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-muted w-20 text-right flex-shrink-0">{label}</span>
      <div className="flex-1 h-7 rounded-lg overflow-hidden bg-surface">
        <div
          className="h-full rounded-lg transition-all duration-700 ease-out flex items-center justify-end pr-3 bg-accent"
          style={{
            width: `${pct}%`,
            minWidth: value > 0 ? "40px" : "0",
          }}
        >
          <span className="text-xs font-semibold text-white">{value}%</span>
        </div>
      </div>
    </div>
  );
}

export default function TrendsPage() {
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState<Trends | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.trends(period).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [period]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (data.scores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-muted">
        <p className="text-lg font-light">No trend data yet</p>
        <p className="text-sm mt-1 text-muted-light">Complete a few days to see your patterns</p>
      </div>
    );
  }

  const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const radarData = dayOrder
    .filter((d) => d in data.day_avgs)
    .map((day) => ({
      day: day.slice(0, 3),
      score: data.day_avgs[day],
    }));

  return (
    <div className="space-y-12 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Trends</h2>
          <p className="text-muted text-sm mt-1">Patterns in your discipline</p>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-border">
          {[30, 60, 90].map((d) => (
            <button
              key={d}
              onClick={() => setPeriod(d)}
              className={`px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${
                period === d
                  ? "bg-accent text-white"
                  : "bg-card text-muted hover:text-foreground"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          label="Best Streak"
          value={`${data.best_streak} days`}
          accent
        />
        <MetricCard
          label="Best Day"
          value={data.best_day || "--"}
          subtitle={data.best_day ? `${data.best_day_avg}% avg` : ""}
        />
        <MetricCard
          label="Worst Day"
          value={data.worst_day || "--"}
          subtitle={data.worst_day ? `${data.worst_day_avg}% avg` : ""}
        />
        <MetricCard label="Avg Goals/Day" value={data.avg_goals} />
      </div>

      {/* Trend area chart */}
      <div className="card p-6">
        <h3 className="text-base font-semibold mb-6 tracking-tight text-foreground">Completion Rate Trend</h3>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={data.scores}>
            <defs>
              <linearGradient id="trendGradFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.12} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(d) =>
                new Date(d).toLocaleDateString("en", { month: "short", day: "numeric" })
              }
              tick={{ fontSize: 11 }}
            />
            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--card-border)",
                borderRadius: 12,
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              }}
              labelFormatter={(d) =>
                new Date(d).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })
              }
              formatter={(v) => [`${v}%`, "Score"]}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="var(--accent)"
              strokeWidth={2}
              fill="url(#trendGradFill)"
              dot={false}
              activeDot={{ r: 4, fill: "var(--accent)", stroke: "var(--card)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Day-of-week radar */}
        {radarData.length > 0 && (
          <div className="card p-6">
            <h3 className="text-base font-semibold mb-6 tracking-tight text-foreground">Score by Day of Week</h3>
            <ResponsiveContainer width="100%" height={320}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fill: "var(--muted-light)", fontSize: 10 }} />
                <Radar
                  dataKey="score"
                  stroke="var(--accent)"
                  fill="var(--accent)"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Completion by goal position */}
        {data.by_position.length > 0 && (
          <div className="card p-6">
            <h3 className="text-base font-semibold mb-2 tracking-tight text-foreground">Completion by Goal Position</h3>
            <p className="text-xs text-muted-light mb-8">
              Do you always finish Goal #1 but drop #3?
            </p>
            <div className="space-y-4">
              {data.by_position.map((pos) => (
                <HorizontalBar
                  key={pos.position}
                  label={`Goal #${pos.position}`}
                  value={pos.rate}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
