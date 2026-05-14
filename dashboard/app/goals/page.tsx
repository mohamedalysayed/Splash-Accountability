"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api, Goal } from "@/lib/api";

function getWordFrequency(goals: Goal[]): { word: string; count: number }[] {
  const stopWords = new Set([
    "the", "a", "an", "to", "and", "or", "my", "i", "for", "on", "in", "at",
    "of", "up", "do", "go", "get", "with", "is", "it", "be", "this", "that",
    "from", "have", "has", "will", "can", "not", "but",
  ]);
  const counts: Record<string, number> = {};
  goals.forEach((g) => {
    g.goal_text
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[.,!?;:'"()\-]/g, ""))
      .filter((w) => w.length > 2 && !stopWords.has(w))
      .forEach((w) => {
        counts[w] = (counts[w] || 0) + 1;
      });
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word, count]) => ({ word, count }));
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [filter, setFilter] = useState("all");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.goals(startDate, endDate, filter).then((g) => {
      setGoals(g);
      setLoading(false);
    });
  }, [startDate, endDate, filter]);

  const wordFreq = getWordFrequency(goals);
  const completed = goals.filter((g) => g.is_completed).length;
  const total = goals.length;

  return (
    <div className="space-y-12 max-w-7xl">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Goal History</h2>
        <p className="text-muted text-sm mt-1">All your goals and their outcomes</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-muted-light uppercase tracking-wider font-medium">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg border border-border bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-accent transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-muted-light uppercase tracking-wider font-medium">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg border border-border bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-accent transition-colors"
          />
        </div>
        <div className="flex rounded-lg overflow-hidden border border-border">
          {["all", "completed", "incomplete"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${
                filter === f
                  ? "bg-accent text-white"
                  : "bg-card text-muted hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="ml-auto text-sm text-muted">
          <span className="text-foreground font-semibold">{completed}</span>/{total} completed
          <span className="text-accent ml-1">
            ({total > 0 ? Math.round((completed / total) * 100) : 0}%)
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Goals table */}
          <div className="card overflow-hidden">
            {goals.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="text-muted text-[10px] uppercase tracking-wider">
                    <th className="text-left px-6 py-4 font-medium">Date</th>
                    <th className="text-center px-6 py-4 font-medium">#</th>
                    <th className="text-left px-6 py-4 font-medium">Goal</th>
                    <th className="text-center px-6 py-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {goals.map((g, i) => (
                    <tr
                      key={`${g.date}-${g.goal_number}-${i}`}
                      className={i % 2 === 1 ? "bg-surface" : ""}
                    >
                      <td className="px-6 py-3.5 text-muted text-sm">{g.date}</td>
                      <td className="px-6 py-3.5 text-center text-muted-light text-sm font-mono">{g.goal_number}</td>
                      <td className="px-6 py-3.5 text-sm text-foreground">{g.goal_text}</td>
                      <td className="px-6 py-3.5 text-center">
                        {g.is_completed ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold text-success">
                            <span className="status-dot bg-success" />
                            Done
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold text-muted-light">
                            <span className="status-dot bg-muted-light" />
                            Missed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-16 text-center text-muted-light">No goals found in this range</div>
            )}
          </div>

          {/* Word frequency */}
          {wordFreq.length > 0 && (
            <div className="card p-6">
              <h3 className="text-base font-semibold mb-6 tracking-tight text-foreground">Common Goal Themes</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={wordFreq} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis dataKey="word" type="category" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--card-border)",
                      borderRadius: 12,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                    }}
                  />
                  <Bar dataKey="count" name="Mentions" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
