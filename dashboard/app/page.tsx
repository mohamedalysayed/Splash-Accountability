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
import Link from "next/link";
import { api, Overview, Score } from "@/lib/api";
import MetricCard from "./components/MetricCard";
import IceScoreOrb from "./components/IceScoreOrb";
import { useAuth } from "@/lib/auth";

function TodayScoreCard({ score, done, set }: { score: number | null; done: number; set: number }) {
  // Viewport-aware sizing — the orb stays balanced on phones without
  // crowding the card text.
  const [size, setSize] = useState(120);
  useEffect(() => {
    const update = () => setSize(window.innerWidth < 640 ? 96 : 120);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div className="card card-hover card-glow p-5 sm:p-7 flex items-center gap-4 sm:gap-6">
      <IceScoreOrb score={score} size={size} />
      <div className="min-w-0">
        <span className="text-[11px] text-muted-light uppercase tracking-wider font-semibold">
          Today&apos;s Score
        </span>
        <div className="text-sm text-muted mt-3">
          {score !== null
            ? `${done}/${set} goals completed`
            : "Waiting for check-in"}
        </div>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [scores30, setScores30] = useState<Score[]>([]);
  const [scores14, setScores14] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const showTrialBanner =
    !!user &&
    !user.is_admin &&
    (user.tier ?? "free") === "free" &&
    !user.has_stripe_customer;

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
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" style={{ boxShadow: '0 0 20px var(--accent-glow)' }} />
      </div>
    );
  }

  if (!overview || overview.error) {
    const steps = [
      { n: 1, title: "Activate your free trial", body: "15 days free, then $0.99/mo. Cancel anytime.", href: "/profile" },
      { n: 2, title: "Link your WhatsApp", body: "So the bot can check in with you at morning, midday & night.", href: "/settings" },
      { n: 3, title: "Reply with 3 goals tomorrow", body: "Just text them back. Your first streak starts.", href: null as string | null },
    ];
    return (
      <div className="max-w-2xl mx-auto pt-8 animate-fade-in">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          You&apos;re in. Let&apos;s set you up.
        </h2>
        <p className="text-muted text-sm mt-2 mb-8">Three steps. About two minutes.</p>
        <div className="card p-7">
          <ol className="space-y-6">
            {steps.map((s) => {
              const body = (
                <div className="flex gap-4 group">
                  <div className="w-8 h-8 rounded-full bg-accent text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                    {s.n}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors">
                      {s.title}
                    </p>
                    <p className="text-xs text-muted mt-1 leading-relaxed">{s.body}</p>
                  </div>
                  {s.href && (
                    <span className="text-accent text-sm self-center opacity-0 group-hover:opacity-100 transition-opacity">
                      →
                    </span>
                  )}
                </div>
              );
              return (
                <li key={s.n}>
                  {s.href ? (
                    <Link href={s.href} className="block">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <p className="text-[11px] text-muted-light text-center mt-6">
          Your dashboard fills in as soon as you start tracking.
        </p>
      </div>
    );
  }

  const streakHot = overview.streak > 3;

  return (
    <div className="space-y-8 sm:space-y-10 max-w-7xl animate-fade-in">
      {showTrialBanner && (
        <Link
          href="/profile"
          className="block card card-hover p-4 sm:p-5 border border-accent/30"
          style={{
            background:
              "linear-gradient(135deg, rgba(99,102,241,0.10), rgba(168,85,247,0.08))",
          }}
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Start your 15-day free trial
              </p>
              <p className="text-xs text-muted mt-0.5">
                Unlock Premium — $0.99/mo after. Cancel anytime.
              </p>
            </div>
            <span className="text-xs font-bold text-accent whitespace-nowrap">
              Activate →
            </span>
          </div>
        </Link>
      )}

      {/* Header */}
      <div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-tight">
          Welcome back,<br className="sm:hidden" /> {overview.user_name}
        </h2>
        <p className="text-muted text-sm sm:text-base mt-2">Here&apos;s your accountability overview</p>
      </div>

      {/* Hero row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 stagger">
        {/* Streak */}
        <div className="card card-hover card-glow p-5 sm:p-7 flex flex-col justify-between">
          <span className="text-[11px] text-muted-light uppercase tracking-wider font-semibold">Current Streak</span>
          <div className="mt-5">
            <span className="text-5xl sm:text-6xl font-bold tracking-tighter text-foreground animate-count">
              {overview.streak}
            </span>
            <span className="text-lg text-muted-light font-normal ml-2">
              day{overview.streak !== 1 ? "s" : ""}
            </span>
          </div>
          {streakHot && (
            <div className="mt-4 badge badge-warning w-fit">
              <span className="w-2 h-2 rounded-full bg-warning glow-pulse" />
              On fire
            </div>
          )}
        </div>

        {/* Today score */}
        <TodayScoreCard score={overview.today_score} done={overview.today_goals_completed} set={overview.today_goals_set} />
        {/* Quick stats */}
        <div className="grid grid-cols-2 lg:grid-cols-1 lg:grid-rows-2 gap-4 sm:gap-6">
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
        <div className="card p-7">
          <h3 className="text-sm font-semibold mb-6 text-foreground">
            Daily Scores <span className="text-muted font-normal">&mdash; Last 30 Days</span>
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={scores30}>
              <defs>
                <linearGradient id="scoreGradFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => new Date(d).toLocaleDateString("en", { month: "short", day: "numeric" })}
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
                labelFormatter={(d) => new Date(d).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}
                formatter={(v) => [`${v}%`, "Score"]}
              />
              <Area
                type="monotone"
                dataKey="score"
                stroke="var(--accent)"
                strokeWidth={2.5}
                fill="url(#scoreGradFill)"
                dot={false}
                activeDot={{ r: 5, fill: "var(--accent)", stroke: "var(--card)", strokeWidth: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Goals bar chart */}
      {scores14.length > 0 && (
        <div className="card p-7">
          <h3 className="text-sm font-semibold mb-6 text-foreground">
            Goals Set vs Completed <span className="text-muted font-normal">&mdash; Last 14 Days</span>
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={scores14} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => new Date(d).toLocaleDateString("en", { month: "short", day: "numeric" })}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
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
                labelFormatter={(d) => new Date(d).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}
              />
              <Bar dataKey="goals_set" name="Set" fill="var(--border)" radius={[8, 8, 0, 0]} />
              <Bar dataKey="goals_completed" name="Completed" fill="var(--success)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
