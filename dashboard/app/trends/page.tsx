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
      <span className="text-sm text-muted w-20 text-right flex-shrink-0 font-medium">{label}</span>
      <div className="flex-1 h-9 rounded-2xl overflow-hidden bg-surface/50">
        <div
          className="h-full rounded-2xl transition-all duration-1000 ease-out flex items-center justify-end pr-4"
          style={{
            width: `${pct}%`,
            minWidth: value > 0 ? "44px" : "0",
            background: `linear-gradient(90deg, var(--accent), var(--accent-hover))`,
            boxShadow: `0 0 16px var(--accent-glow)`,
          }}
        >
          <span className="text-xs font-bold text-white drop-shadow-sm">{value}%</span>
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
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" style={{ boxShadow: '0 0 20px var(--accent-glow)' }} />
      </div>
    );
  }

  if (data.scores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-muted animate-fade-in">
        <div className="w-24 h-24 rounded-3xl bg-accent-soft flex items-center justify-center mb-6 animate-float glow-pulse">
          <svg className="w-12 h-12 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <p className="text-xl font-bold text-foreground">No trend data yet</p>
        <p className="text-sm mt-2 text-muted">Complete a few days to see your patterns</p>
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
    <div className="space-y-10 max-w-7xl animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Trends</h2>
          <p className="text-muted text-sm mt-1">Patterns in your discipline</p>
        </div>
        <div className="segment-group">
          {[30, 60, 90].map((d) => (
            <button
              key={d}
              onClick={() => setPeriod(d)}
              className={`segment-btn ${period === d ? "segment-btn-active" : ""}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 stagger">
        <MetricCard
          label="Best Streak"
          value={`${data.best_streak} days`}
          accent
        />
        <MetricCard
          label="Best Day"
          value={data.best_day || "—"}
          subtitle={
            data.best_day
              ? data.worst_day
                ? `${data.best_day_avg}% avg`
                : `${data.best_day_avg}% — your only sample so far`
              : "Log a few days to see"
          }
        />
        <MetricCard
          label="Worst Day"
          value={data.worst_day || "—"}
          subtitle={
            data.worst_day
              ? `${data.worst_day_avg}% avg`
              : "Need a few more days to compare"
          }
        />
        <MetricCard label="Avg Goals/Day" value={data.avg_goals} />
      </div>

      {/* Trend area chart */}
      <div className="card p-7">
        <h3 className="text-sm font-semibold mb-6 text-foreground">Completion Rate Trend</h3>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={data.scores}>
            <defs>
              <linearGradient id="trendGradFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d) =>
                new Date(d).toLocaleDateString("en", { month: "short", day: "numeric" })
              }
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card-hover)",
                border: "1px solid var(--card-border)",
                borderRadius: 16,
                boxShadow: "var(--shadow-lg)",
                backdropFilter: "blur(20px)",
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
              strokeWidth={2.5}
              fill="url(#trendGradFill)"
              dot={false}
              activeDot={{ r: 5, fill: "var(--accent)", stroke: "var(--card)", strokeWidth: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Day-of-week radar */}
        {radarData.length > 0 && (
          <div className="card p-7">
            <h3 className="text-sm font-semibold mb-6 text-foreground">Score by Day of Week</h3>
            <ResponsiveContainer width="100%" height={320}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fill: "var(--muted-light)", fontSize: 10 }} />
                <Radar
                  dataKey="score"
                  stroke="var(--accent)"
                  fill="var(--accent)"
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Completion by goal position */}
        {data.by_position.length > 0 && (
          <div className="card p-7">
            <h3 className="text-sm font-semibold mb-2 text-foreground">Completion by Goal Position</h3>
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
