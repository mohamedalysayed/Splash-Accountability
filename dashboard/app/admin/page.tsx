"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  adminApi,
  ApiError,
  type AdminStats,
  type AdminUsage,
  type AdminUserRow,
  type Tier,
} from "@/lib/api";
import Avatar from "../components/Avatar";

function fmtUsd(n: number): string {
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 10) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const PAGE_SIZE = 25;
const TIER_OPTIONS: Tier[] = ["free", "premium", "lifetime"];

function fmtRelative(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function tierBadge(tier: Tier) {
  const map = {
    free: "bg-muted/10 text-muted border-border",
    premium: "bg-gradient-to-r from-amber-400 to-orange-500 text-white border-transparent",
    lifetime: "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white border-transparent",
  } as const;
  return map[tier] ?? map.free;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [usage, setUsage] = useState<AdminUsage | null>(null);
  const [usageDays, setUsageDays] = useState<number>(30);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<"" | Tier>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // Per-row pending edits, keyed by user id. Reviewers asked us to drop the
  // auto-save-on-change pattern (too easy to mis-toggle in a long list) in
  // favour of an explicit Save button per row. Each entry only stores the
  // *changed* fields so we can render "no changes" / "save" reliably.
  const [pending, setPending] = useState<
    Record<number, { tier?: Tier; is_admin?: boolean }>
  >({});
  const [savedFlash, setSavedFlash] = useState<number | null>(null);

  // Route guard — redirect non-admins. We still gate visibility server-side too.
  useEffect(() => {
    if (authLoading) return;
    if (!user || !user.is_admin) {
      router.replace("/");
    }
  }, [authLoading, user, router]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, usersRes] = await Promise.all([
        adminApi.stats(),
        adminApi.listUsers({
          search: search.trim() || undefined,
          tier: tierFilter || undefined,
          limit: PAGE_SIZE,
          offset,
        }),
      ]);
      setStats(statsRes);
      setRows(usersRes.users);
      setTotal(usersRes.total);
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : undefined;
      setError(detail || "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, [search, tierFilter, offset]);

  // Anthropic usage — loaded independently from the main user table so a slow
  // aggregation never blocks the admin grid. Re-fires when the window changes.
  useEffect(() => {
    if (authLoading || !user?.is_admin) return;
    adminApi.usage(usageDays).then(setUsage).catch(() => setUsage(null));
  }, [authLoading, user, usageDays]);

  // Initial + when filters/page change. Debounce search lightly so each
  // keystroke doesn't hammer the API.
  useEffect(() => {
    if (authLoading || !user?.is_admin) return;
    const t = setTimeout(refresh, 250);
    return () => clearTimeout(t);
  }, [authLoading, user, refresh]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setOffset(0);
  }, [search, tierFilter]);

  /** Stage a single field edit for `id`. We diff against the row's current
   *  value so flipping a control back to its original state correctly clears
   *  the dirty marker (no Save button left dangling on a no-op change). */
  function stageEdit(id: number, patch: { tier?: Tier; is_admin?: boolean }) {
    setSavedFlash((s) => (s === id ? null : s));
    setPending((prev) => {
      const row = rows.find((r) => r.id === id);
      const merged = { ...(prev[id] ?? {}), ...patch };
      if (row) {
        if (merged.tier !== undefined && merged.tier === row.tier) {
          delete merged.tier;
        }
        if (
          merged.is_admin !== undefined &&
          merged.is_admin === row.is_admin
        ) {
          delete merged.is_admin;
        }
      }
      const next = { ...prev };
      if (Object.keys(merged).length === 0) {
        delete next[id];
      } else {
        next[id] = merged;
      }
      return next;
    });
  }

  async function saveRow(id: number) {
    const patch = pending[id];
    if (!patch || Object.keys(patch).length === 0) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await adminApi.updateUser(id, patch);
      // Splice the updated user back in-place
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                tier: (res.user.tier ?? r.tier) as Tier,
                is_admin: res.user.is_admin ?? r.is_admin,
                tier_updated_at: res.user.tier_updated_at ?? r.tier_updated_at,
              }
            : r
        )
      );
      // Clear pending for this row (it's now in sync with the server)
      setPending((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setSavedFlash(id);
      setTimeout(
        () => setSavedFlash((s) => (s === id ? null : s)),
        2000,
      );
      // Stats may shift (tier counts, admin count) — refresh in background
      adminApi.stats().then(setStats).catch(() => {});
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : undefined;
      setError(detail || "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  function revertRow(id: number) {
    setPending((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const statCards = useMemo(() => {
    if (!stats) return [];
    return [
      { label: "Total users", value: stats.total_users, sub: `${stats.new_7d} new this week` },
      { label: "Active (7d)", value: stats.active_7d, sub: `${Math.round((stats.active_7d / Math.max(stats.total_users, 1)) * 100)}% of base` },
      { label: "Premium", value: (stats.by_tier.premium ?? 0) + (stats.by_tier.lifetime ?? 0), sub: `${stats.by_tier.lifetime ?? 0} lifetime` },
      { label: "Admins", value: stats.admins, sub: "From ADMIN_EMAILS" },
    ];
  }, [stats]);

  if (authLoading || (!user?.is_admin && !error)) {
    return (
      <div className="card p-8 animate-fade-in">
        <div className="h-6 w-40 bg-muted/20 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Admin</h2>
          <p className="text-muted text-sm mt-1">Eagle view of every Splash account.</p>
        </div>
        <span className="badge badge-success">
          <span className="status-dot bg-success" />
          {user?.email}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <div key={c.label} className="card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-light">{c.label}</p>
            <p className="text-3xl font-bold tracking-tighter text-foreground mt-2">{c.value}</p>
            <p className="text-[11px] text-muted mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Anthropic spend */}
      <div className="card p-5 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-light">
              Anthropic spend
            </p>
            <p className="text-xs text-muted mt-1">
              Logged from our own ledger — Anthropic has no balance API.
            </p>
          </div>
          <div className="segment-group">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setUsageDays(d)}
                className={`segment-btn ${usageDays === d ? "segment-btn-active" : ""}`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {!usage && (
          <div className="text-xs text-muted">Loading usage…</div>
        )}

        {usage && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-border p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-light font-semibold">
                  Last {usage.window_days}d
                </p>
                <p className="text-2xl font-bold tracking-tighter mt-2 text-foreground">
                  {fmtUsd(usage.total_usd)}
                </p>
                <p className="text-[11px] text-muted mt-1">
                  {usage.total_calls.toLocaleString()} calls
                </p>
              </div>
              <div className="rounded-2xl border border-border p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-light font-semibold">
                  Month-to-date
                </p>
                <p className="text-2xl font-bold tracking-tighter mt-2 text-foreground">
                  {fmtUsd(usage.mtd_usd)}
                </p>
                <p className="text-[11px] text-muted mt-1">this calendar month</p>
              </div>
              <div className="rounded-2xl border border-border p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-light font-semibold">
                  Projected month
                </p>
                <p className="text-2xl font-bold tracking-tighter mt-2 text-foreground">
                  {fmtUsd(usage.projected_month_usd)}
                </p>
                <p className="text-[11px] text-muted mt-1">naive linear</p>
              </div>
              <div className="rounded-2xl border border-border p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-light font-semibold">
                  Tokens
                </p>
                <p className="text-2xl font-bold tracking-tighter mt-2 text-foreground">
                  {fmtTokens(usage.total_input_tokens + usage.total_output_tokens)}
                </p>
                <p className="text-[11px] text-muted mt-1">
                  in {fmtTokens(usage.total_input_tokens)} · out {fmtTokens(usage.total_output_tokens)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-light font-semibold mb-3">
                  By model
                </p>
                {usage.by_model.length === 0 ? (
                  <p className="text-xs text-muted">No usage in this window.</p>
                ) : (
                  <ul className="space-y-2">
                    {usage.by_model.map((m) => (
                      <li
                        key={m.model}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="font-mono text-muted truncate">{m.model}</span>
                        <span className="text-foreground font-semibold flex-shrink-0">
                          {fmtUsd(m.cost_usd)}{" "}
                          <span className="text-muted-light font-normal">
                            · {m.calls}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-light font-semibold mb-3">
                  Top users
                </p>
                {usage.top_users.length === 0 ? (
                  <p className="text-xs text-muted">No attributable usage yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {usage.top_users.map((u) => (
                      <li
                        key={u.user_id}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="text-foreground truncate">
                          {u.name}
                          {u.email && (
                            <span className="text-muted-light ml-1">· {u.email}</span>
                          )}
                        </span>
                        <span className="text-foreground font-semibold flex-shrink-0">
                          {fmtUsd(u.cost_usd)}{" "}
                          <span className="text-muted-light font-normal">
                            · {u.calls}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="card p-5 flex gap-3 flex-wrap items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or phone…"
          className="input flex-1 min-w-[220px]"
        />
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value as "" | Tier)}
          className="input w-auto"
        >
          <option value="">All tiers</option>
          <option value="free">Free</option>
          <option value="premium">Premium</option>
          <option value="lifetime">Lifetime</option>
        </select>
        <button onClick={refresh} className="btn-secondary text-xs" disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="text-sm rounded-2xl px-4 py-3 font-medium text-danger badge-danger">{error}</div>
      )}

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-light border-b border-border">
                <th className="px-5 py-4">User</th>
                <th className="px-3 py-4">Tier</th>
                <th className="px-3 py-4">Admin</th>
                <th className="px-3 py-4 hidden md:table-cell">Streak</th>
                <th className="px-3 py-4 hidden lg:table-cell">Days</th>
                <th className="px-3 py-4 hidden lg:table-cell">Last active</th>
                <th className="px-3 py-4 hidden md:table-cell">Joined</th>
                <th className="px-3 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-muted">
                    No users match these filters.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const isSelf = user?.id === r.id;
                const isBusy = busyId === r.id;
                const rowPending = pending[r.id];
                const isDirty = !!rowPending && Object.keys(rowPending).length > 0;
                // Effective values: pending edit overrides server state in
                // the controls, but the badge still reflects the live tier
                // so admins can see the diff at a glance.
                const editTier = rowPending?.tier ?? r.tier;
                const editIsAdmin =
                  rowPending?.is_admin ?? r.is_admin;
                const justSaved = savedFlash === r.id;
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-border/50 transition-colors ${
                      isDirty ? "bg-accent-soft/40" : "hover:bg-accent-soft/30"
                    }`}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar src={r.avatar_url} name={r.name} nickname={r.nickname} size={36} />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {r.nickname || r.name}
                            {isSelf && <span className="text-[10px] text-muted-light ml-2">(you)</span>}
                          </p>
                          <p className="text-[11px] text-muted-light truncate">{r.email || r.phone || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${tierBadge(r.tier)}`}
                        >
                          {r.tier}
                        </span>
                        <select
                          value={editTier}
                          onChange={(e) => stageEdit(r.id, { tier: e.target.value as Tier })}
                          disabled={isBusy}
                          className={`text-[11px] bg-transparent border rounded-lg px-2 py-1 focus:outline-none focus:border-accent disabled:opacity-40 ${
                            rowPending?.tier !== undefined
                              ? "border-accent text-accent"
                              : "border-border"
                          }`}
                          aria-label={`Tier for ${r.email || r.name}`}
                        >
                          {TIER_OPTIONS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editIsAdmin}
                          disabled={isBusy || isSelf}
                          onChange={(e) => stageEdit(r.id, { is_admin: e.target.checked })}
                          className="h-4 w-4 rounded border-border text-accent focus:ring-accent disabled:opacity-40"
                        />
                        {rowPending?.is_admin !== undefined ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
                            pending
                          </span>
                        ) : (
                          r.is_admin && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-accent">✓</span>
                          )
                        )}
                      </label>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell text-foreground">
                      {r.current_streak}
                      <span className="text-[10px] text-muted-light ml-1">/ {r.best_streak}</span>
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell text-muted">{r.total_days}</td>
                    <td className="px-3 py-3 hidden lg:table-cell text-muted text-xs">
                      {fmtRelative(r.last_active_at)}
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell text-muted text-xs">
                      {fmtRelative(r.created_at)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-2 justify-end">
                        {justSaved && !isDirty && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-success">
                            ✓ saved
                          </span>
                        )}
                        {isDirty && !isBusy && (
                          <button
                            type="button"
                            onClick={() => revertRow(r.id)}
                            className="text-[11px] text-muted hover:text-foreground transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => saveRow(r.id)}
                          disabled={!isDirty || isBusy}
                          className="btn-primary text-[11px] px-3 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {isBusy ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border text-xs text-muted">
            <span>
              Page {currentPage} of {totalPages} — {total} users
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0 || loading}
                className="btn-secondary text-xs disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total || loading}
                className="btn-secondary text-xs disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-light">
        Admin status is sourced from the <code className="px-1 rounded bg-accent-soft text-accent">ADMIN_EMAILS</code>{" "}
        environment variable. Toggling it here will revert on the next sign-in if the email isn't whitelisted.
      </p>
    </div>
  );
}
