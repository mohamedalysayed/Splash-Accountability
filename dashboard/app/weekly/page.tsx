"use client";

import { useEffect, useState } from "react";
import { api, WeeklyData } from "@/lib/api";
import IceScoreOrb from "../components/IceScoreOrb";

function scoreColor(score: number | null): string {
  if (score === null) return "var(--muted-light)";
  if (score >= 80) return "var(--success)";
  if (score >= 50) return "var(--warning)";
  return "var(--danger)";
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function isToday(dateStr: string): boolean {
  return dateStr === todayISO();
}

function isFuture(dateStr: string): boolean {
  return dateStr > todayISO();
}

// Warm, varied copy for past days where the user didn't log anything.
// Stable per-date so a day doesn't change its label between renders.
const REST_COPY = [
  "rest day",
  "blank slate",
  "off the grid",
  "skipped",
  "no entry",
  "quiet day",
  "took a breath",
];

function restCopyFor(dateStr: string): string {
  // Tiny deterministic hash so the same date always shows the same phrase.
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) h = (h * 31 + dateStr.charCodeAt(i)) | 0;
  return REST_COPY[Math.abs(h) % REST_COPY.length];
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
          <div className="grid grid-cols-7 gap-3 stagger" style={{ minWidth: 0 }}>
            {data.days.map((day) => {
              const today = isToday(day.date);
              const future = isFuture(day.date);
              const hasScore = day.score !== null;
              return (
                <div
                  key={day.date}
                  className={`card card-hover p-3 sm:p-4 text-center min-w-0 flex flex-col items-center ${
                    today ? "ring-2 ring-accent/40 bg-accent-soft/30" : ""
                  }`}
                >
                  {today ? (
                    <div className="text-[10px] sm:text-[11px] text-accent uppercase tracking-wider font-bold mb-1">
                      Today
                    </div>
                  ) : (
                    <div className="text-[10px] sm:text-[11px] text-muted-light uppercase tracking-wider font-semibold mb-1">
                      {day.day_short}
                    </div>
                  )}
                  <div className={`text-[11px] sm:text-xs mb-2 ${today ? "text-accent font-medium" : "text-muted-light"}`}>
                    {new Date(day.date + "T00:00").getDate()}
                  </div>

                  {hasScore ? (
                    <>
                      <IceScoreOrb score={day.score} size={52} />
                      <div className="text-[10px] text-muted-light mt-1 font-medium">
                        {day.goals_completed}/{day.goals_set}
                      </div>
                    </>
                  ) : (
                    // Empty state — soft circle placeholder so the grid stays
                    // visually rhythmic, with warm copy underneath instead of
                    // a cold "--". Different message for past / today / future.
                    <>
                      <div
                        className="rounded-full flex items-center justify-center"
                        style={{
                          width: 52,
                          height: 52,
                          background:
                            "radial-gradient(circle at 32% 26%, rgba(255,255,255,0.10), rgba(255,255,255,0.02) 70%)",
                          border: "1px dashed var(--border)",
                        }}
                      >
                        <span className="text-[18px] text-muted-light">·</span>
                      </div>
                      <div className="text-[10px] text-muted-light mt-2 font-medium italic leading-tight">
                        {future
                          ? "soon"
                          : today
                          ? "checking in…"
                          : restCopyFor(day.date)}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Weekly completion ring */}
          <div className="card card-glow p-6 sm:p-7 flex items-center gap-6 sm:gap-8">
            <IceScoreOrb score={data.avg} size={120} />
            <div className="min-w-0">
              <span className="text-[11px] text-muted-light uppercase tracking-wider font-semibold">
                Weekly Completion Rate
              </span>
              <div className="text-3xl sm:text-4xl font-bold tracking-tighter text-foreground mt-2 animate-count">
                {data.avg}%
              </div>
              <p className="text-xs text-muted mt-1">
                {data.avg >= 80
                  ? "Locked in. Keep the streak alive."
                  : data.avg >= 50
                  ? "Solid week. A nudge gets you to green."
                  : data.avg > 0
                  ? "Reset day tomorrow — fresh slate."
                  : "First check-in starts your week."}
              </p>
            </div>
          </div>

          {/* Detail table */}
          <div className="card" style={{ overflow: 'hidden' }}>
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
                {data.days.map((day) => {
                  const future = isFuture(day.date);
                  const today = isToday(day.date);
                  const blankCell = (
                    <span className="text-muted-light italic">
                      {future ? "soon" : today ? "—" : "—"}
                    </span>
                  );
                  return (
                    <tr
                      key={day.date}
                      className="table-row border-b border-border last:border-b-0"
                    >
                      <td className="px-6 py-4 font-medium text-sm text-foreground">{day.day_name}</td>
                      <td className="px-6 py-4 text-center text-muted text-sm">{day.date}</td>
                      <td className="px-6 py-4 text-center text-sm text-foreground">
                        {day.goals_set || blankCell}
                      </td>
                      <td className="px-6 py-4 text-center text-sm text-foreground">
                        {day.goals_completed || blankCell}
                      </td>
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
                          <span className="text-muted-light italic text-xs">
                            {future ? "soon" : today ? "in progress" : restCopyFor(day.date)}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center text-sm text-foreground">{day.streak || blankCell}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
