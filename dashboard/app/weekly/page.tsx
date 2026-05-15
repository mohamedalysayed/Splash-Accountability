"use client";

import { useEffect, useState } from "react";
import { api, WeeklyData } from "@/lib/api";

function scoreColor(score: number | null): string {
  if (score === null) return "var(--muted-light)";
  if (score >= 80) return "var(--success)";
  if (score >= 50) return "var(--warning)";
  return "var(--danger)";
}

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = scoreColor(score);

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
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="score-ring-animated"
        style={{
          "--ring-circumference": circumference,
          "--ring-offset": offset,
          filter: `drop-shadow(0 0 4px ${color})`,
        } as React.CSSProperties}
      />
    </svg>
  );
}

function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().split("T")[0];
  return dateStr === today;
}

export default function WeeklyPage() {
  const [weeks, setWeeks] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [data, setData] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.weeks().then((w) => {
      setWeeks(w);
      if (w.length > 0) setSelected(w[0]);
      else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    api.weekly(selected).then((d) => {
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selected]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" style={{ boxShadow: '0 0 20px var(--accent-glow)' }} />
      </div>
    );
  }

  return (
    <div className="space-y-10 max-w-7xl animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Weekly View</h2>
          <p className="text-muted text-sm mt-1">Your week at a glance</p>
        </div>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="text-sm font-medium px-4 py-2.5 rounded-2xl border border-card-border bg-card text-foreground outline-none transition-all duration-300 focus:border-accent focus:ring-2 focus:ring-ring"
          style={{ backdropFilter: 'blur(20px)' }}
        >
          {weeks.map((w) => (
            <option key={w} value={w}>
              Week of {new Date(w).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
            </option>
          ))}
          {weeks.length === 0 && <option>No data yet</option>}
        </select>
      </div>

      {data && (
        <>
          {/* Day tiles */}
          <div className="grid grid-cols-7 gap-4 stagger">
            {data.days.map((day) => {
              const today = isToday(day.date);
              return (
                <div
                  key={day.date}
                  className={`card card-hover p-5 text-center ${
                    today ? "ring-2 ring-accent/40 glow-pulse" : ""
                  }`}
                >
                  <div className="text-[11px] text-muted-light uppercase tracking-wider font-semibold mb-1">
                    {day.day_short}
                  </div>
                  <div className="text-xs text-muted-light mb-3">
                    {new Date(day.date).getDate()}
                  </div>
                  <div
                    className="text-2xl font-bold tracking-tight transition-colors"
                    style={{ color: scoreColor(day.score), textShadow: day.score !== null ? `0 0 20px ${scoreColor(day.score)}40` : 'none' }}
                  >
                    {day.score !== null ? `${day.score}%` : "--"}
                  </div>
                  {day.score !== null && (
                    <div className="text-[10px] text-muted-light mt-2 font-medium">
                      {day.goals_completed}/{day.goals_set}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Weekly completion ring */}
          <div className="card card-glow p-7 flex items-center gap-8">
            <div className="relative flex-shrink-0">
              <ScoreRing score={data.avg} size={110} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold text-foreground">{data.avg}%</span>
              </div>
            </div>
            <div>
              <span className="text-[11px] text-muted-light uppercase tracking-wider font-semibold">Weekly Completion Rate</span>
              <div className="text-4xl font-bold tracking-tighter text-accent mt-2 animate-count" style={{ textShadow: '0 0 30px var(--accent-glow)' }}>
                {data.avg}%
              </div>
            </div>
          </div>

          {/* Detail table */}
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-4 text-[10px] text-muted-light uppercase tracking-wider font-semibold">Day</th>
                  <th className="text-center px-6 py-4 text-[10px] text-muted-light uppercase tracking-wider font-semibold">Date</th>
                  <th className="text-center px-6 py-4 text-[10px] text-muted-light uppercase tracking-wider font-semibold">Goals Set</th>
                  <th className="text-center px-6 py-4 text-[10px] text-muted-light uppercase tracking-wider font-semibold">Completed</th>
                  <th className="text-center px-6 py-4 text-[10px] text-muted-light uppercase tracking-wider font-semibold">Score</th>
                  <th className="text-center px-6 py-4 text-[10px] text-muted-light uppercase tracking-wider font-semibold">Streak</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((day) => (
                  <tr
                    key={day.date}
                    className="table-row border-b border-border last:border-b-0"
                  >
                    <td className="px-6 py-4 font-medium text-sm text-foreground">{day.day_name}</td>
                    <td className="px-6 py-4 text-center text-muted text-sm">{day.date}</td>
                    <td className="px-6 py-4 text-center text-sm text-foreground">{day.goals_set || "--"}</td>
                    <td className="px-6 py-4 text-center text-sm text-foreground">{day.goals_completed || "--"}</td>
                    <td className="px-6 py-4 text-center">
                      {day.score !== null ? (
                        <span
                          className="badge"
                          style={{
                            color: scoreColor(day.score),
                            background: day.score >= 80
                              ? "var(--success-soft)"
                              : day.score >= 50
                              ? "var(--warning-soft)"
                              : "var(--danger-soft)",
                          }}
                        >
                          {day.score}%
                        </span>
                      ) : (
                        <span className="text-muted-light">--</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-foreground">{day.streak || "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
