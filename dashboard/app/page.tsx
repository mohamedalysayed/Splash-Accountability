"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api, Overview, Score } from "@/lib/api";
import MetricCard from "./components/MetricCard";

function ScoreRing({ score, size = 96 }: { score: number; size?: number }) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--border)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="score-ring-animated"
        style={{
          "--ring-circumference": circumference,
          "--ring-offset": offset,
        } as React.CSSProperties}
      />
    </svg>
  );
}

export default function OverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [scores30, setScores30] = useState<Score[]>([]);
  const [scores14, setScores14] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [ov, s30, s14] = await Promise.all([
          api.overview(),
          api.scores(30),
          api.scores(14),
        ]);
        setOverview(ov);
        setScores30(s30);
        setScores14(s14);
      } catch (e) {
        console.error("Failed to load overview", e);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!overview || overview.error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-muted">
        <svg className="w-16 h-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p className="text-lg font-light">No data yet</p>
        <p className="text-sm mt-1 text-muted-light">Start the agent and complete your first day</p>
      </div>
    );
  }

  const streakHot = overview.streak > 3;

  return (
    <div className="space-y-12 max-w-7xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Welcome back, {overview.user_name}
        </h2>
        <p className="text-muted text-sm mt-1">Here&apos;s your accountability overview</p>
      </div>

      {/* Hero row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Streak */}
        <div className="card p-6 flex flex-col justify-between">
          <span className="text-xs text-muted-light uppercase tracking-wider font-medium">Current Streak</span>
          <div className="mt-4">
            <span className="text-6xl font-semibold tracking-tighter text-foreground animate-count">
              {overview.streak}
            </span>
            <span className="text-xl text-muted-light font-light ml-2">
              day{overview.streak !== 1 ? "s" : ""}
            </span>
          </div>
          {streakHot && (
            <div className="mt-4 flex items-center gap-2 text-warning text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-warning" />
              On fire
            </div>
          )}
        </div>

        {/* Today score */}
        <div className="card p-6 flex items-center gap-6">
          <div className="relative flex-shrink-0">
            <ScoreRing score={overview.today_score ?? 0} size={96} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-semibold text-foreground">
                {overview.today_score !== null ? `${overview.today_score}%` : "--"}
              </span>
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-light uppercase tracking-wider font-medium">Today&apos;s Score</span>
            <div className="text-sm text-muted mt-2">
              {overview.today_score !== null
                ? `${overview.today_goals_completed}/${overview.today_goals_set} goals completed`
                : "Waiting for check-in"}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-rows-2 gap-6">
          <MetricCard
            label="7-Day Average"
            value={`${overview.avg_7}%`}
            accent={overview.avg_7 >= 80}
          />
          <MetricCard
            label="Days Tracked"
            value={overview.total_days}
          />
        </div>
      </div>

      {/* Score trend chart */}
      {scores30.length > 0 && (
        <div className="card p-6">
          <h3 className="text-base font-semibold mb-6 tracking-tight text-foreground">
            Daily Scores <span className="text-muted font-normal">&mdash; Last 30 Days</span>
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={scores30}>
              <defs>
                <linearGradient id="scoreGradFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => new Date(d).toLocaleDateString("en", { month: "short", day: "numeric" })}
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
                labelFormatter={(d) => new Date(d).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}
                formatter={(v) => [`${v}%`, "Score"]}
              />
              <Area
                type="monotone"
                dataKey="score"
                stroke="var(--accent)"
                strokeWidth={2}
                fill="url(#scoreGradFill)"
                dot={false}
                activeDot={{ r: 4, fill: "var(--accent)", stroke: "var(--card)", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Goals bar chart */}
      {scores14.length > 0 && (
        <div className="card p-6">
          <h3 className="text-base font-semibold mb-6 tracking-tight text-foreground">
            Goals Set vs Completed <span className="text-muted font-normal">&mdash; Last 14 Days</span>
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={scores14} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => new Date(d).toLocaleDateString("en", { month: "short", day: "numeric" })}
                tick={{ fontSize: 11 }}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--card-border)",
                  borderRadius: 12,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                }}
                labelFormatter={(d) => new Date(d).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}
              />
              <Bar dataKey="goals_set" name="Set" fill="var(--border)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="goals_completed" name="Completed" fill="var(--success)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
