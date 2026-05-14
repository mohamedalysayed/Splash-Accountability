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
        stroke={scoreColor(score)}
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
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    api.weekly(selected).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [selected]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-12 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Weekly View</h2>
          <p className="text-muted text-sm mt-1">Your week at a glance</p>
        </div>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="text-sm font-medium px-4 py-2.5 rounded-lg border border-border bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-accent transition-colors"
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
          <div className="grid grid-cols-7 gap-4">
            {data.days.map((day) => {
              const today = isToday(day.date);
              return (
                <div
                  key={day.date}
                  className={`card rounded-xl p-5 text-center ${today ? "border-accent" : ""}`}
                >
                  <div className="text-[11px] text-muted-light uppercase tracking-wider font-medium mb-1">
                    {day.day_short}
                  </div>
                  <div className="text-xs text-muted-light mb-3">
                    {new Date(day.date).getDate()}
                  </div>
                  <div
                    className="text-2xl font-semibold tracking-tight"
                    style={{ color: scoreColor(day.score) }}
                  >
                    {day.score !== null ? `${day.score}%` : "--"}
                  </div>
                  {day.score !== null && (
                    <div className="text-[10px] text-muted-light mt-2">
                      {day.goals_completed}/{day.goals_set}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Weekly completion ring */}
          <div className="card p-6 flex items-center gap-8">
            <div className="relative flex-shrink-0">
              <ScoreRing score={data.avg} size={100} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-semibold text-foreground">{data.avg}%</span>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-light uppercase tracking-wider font-medium">Weekly Completion Rate</span>
              <div className="text-4xl font-semibold tracking-tighter text-accent mt-2 animate-count">
                {data.avg}%
              </div>
            </div>
          </div>

          {/* Detail table */}
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-muted text-[10px] uppercase tracking-wider">
                  <th className="text-left px-6 py-4 font-medium">Day</th>
                  <th className="text-center px-6 py-4 font-medium">Date</th>
                  <th className="text-center px-6 py-4 font-medium">Goals Set</th>
                  <th className="text-center px-6 py-4 font-medium">Completed</th>
                  <th className="text-center px-6 py-4 font-medium">Score</th>
                  <th className="text-center px-6 py-4 font-medium">Streak</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((day, i) => (
                  <tr
                    key={day.date}
                    className={i % 2 === 1 ? "bg-surface" : ""}
                  >
                    <td className="px-6 py-4 font-medium text-sm text-foreground">{day.day_name}</td>
                    <td className="px-6 py-4 text-center text-muted text-sm">{day.date}</td>
                    <td className="px-6 py-4 text-center text-sm text-foreground">{day.goals_set || "--"}</td>
                    <td className="px-6 py-4 text-center text-sm text-foreground">{day.goals_completed || "--"}</td>
                    <td className="px-6 py-4 text-center">
                      {day.score !== null ? (
                        <span
                          className="inline-block px-3 py-1 rounded-full text-xs font-semibold"
                          style={{ color: scoreColor(day.score) }}
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
