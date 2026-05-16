export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

export class ApiError extends Error {
  status: number;
  detail?: string;
  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...options,
    headers,
  });

  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = await res.json();
      detail = typeof body?.detail === "string" ? body.detail : undefined;
    } catch {
      /* non-json body */
    }
    throw new ApiError(res.status, `API error: ${res.status}`, detail);
  }
  return res.json();
}

/** Multipart upload — used for avatars. Do NOT set Content-Type; browser sets boundary. */
async function fetchMultipart<T>(path: string, form: FormData): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", body: form, headers });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = await res.json();
      detail = typeof body?.detail === "string" ? body.detail : undefined;
    } catch {
      /* */
    }
    throw new ApiError(res.status, `API error: ${res.status}`, detail);
  }
  return res.json();
}

/** Resolve a server-relative avatar URL (e.g. /avatars/abc.jpg) into an absolute URL. */
export function resolveAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

// Auth types
export type Tier = "free" | "premium" | "lifetime";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused"
  | null;

export interface AuthUser {
  id: number | string;
  name: string;
  email: string;
  phone?: string | null;
  timezone?: string;
  is_active?: boolean;
  nickname?: string | null;
  avatar_url?: string | null;
  is_admin?: boolean;
  tier?: Tier;
  tier_updated_at?: string | null;
  subscription_status?: SubscriptionStatus;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  has_stripe_customer?: boolean;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

// Auth API
export const authApi = {
  register: (data: { email: string; password: string; name: string; phone?: string }) =>
    fetchJSON<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    fetchJSON<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Sign in or sign up with a Google ID token (the `credential` from
   *  Google Identity Services). Returns the same {token, user} shape as
   *  /login and /register, so the caller can reuse the auth context's
   *  login() function unchanged. */
  google: (credential: string) =>
    fetchJSON<AuthResponse>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),

  me: () => fetchJSON<{ user: AuthUser }>("/api/auth/me"),

  linkPhone: (phone: string) =>
    fetchJSON<{ user: AuthUser }>("/api/auth/link-phone", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
};

// Profile API
export const profileApi = {
  update: (data: { nickname?: string | null }) =>
    fetchJSON<{ user: AuthUser }>("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return fetchMultipart<{ user: AuthUser }>("/api/profile/avatar", form);
  },
  deleteAvatar: () =>
    fetchJSON<{ user: AuthUser }>("/api/profile/avatar", { method: "DELETE" }),
};

// Admin API
export interface AdminUserRow {
  id: number;
  email: string | null;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
  phone: string | null;
  is_admin: boolean;
  is_active: boolean;
  tier: Tier;
  tier_updated_at: string | null;
  created_at: string | null;
  last_active_at: string | null;
  total_days: number;
  best_streak: number;
  current_streak: number;
  reply_count: number;
}

export interface AdminUsersResponse {
  users: AdminUserRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminStats {
  total_users: number;
  by_tier: Record<string, number>;
  active_7d: number;
  new_7d: number;
  admins: number;
}

export interface AdminUsageTopUser {
  user_id: number;
  name: string;
  email: string | null;
  cost_usd: number;
  calls: number;
}

export interface AdminUsage {
  window_days: number;
  total_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_calls: number;
  by_day: { date: string; cost_usd: number; calls: number }[];
  by_model: { model: string; cost_usd: number; calls: number }[];
  top_users: AdminUsageTopUser[];
  mtd_usd: number;
  projected_month_usd: number;
}

// Public app config — Twilio sandbox number + join phrase. Used by the
// onboarding card so we can ship copy without hardcoding either value.
export interface PublicConfig {
  whatsapp_number: string;
  sandbox_join_code: string;
  is_sandbox: boolean;
}

export const configApi = {
  get: () => fetchJSON<PublicConfig>("/api/config"),
};

// Billing API
export const billingApi = {
  subscribeUrl: () => fetchJSON<{ url: string }>("/api/billing/subscribe-url"),
  portal: () => fetchJSON<{ url: string }>("/api/billing/portal", { method: "POST" }),
  /** Pull subscription state from Stripe and apply it. Self-recovery for
   *  any case where webhooks didn't land (rare, but possible). */
  sync: () =>
    fetchJSON<{ status: string; user: AuthUser }>("/api/billing/sync", { method: "POST" }),
};

export const adminApi = {
  listUsers: (params: { search?: string; tier?: string; limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set("search", params.search);
    if (params.tier) q.set("tier", params.tier);
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.offset != null) q.set("offset", String(params.offset));
    const qs = q.toString();
    return fetchJSON<AdminUsersResponse>(`/api/admin/users${qs ? `?${qs}` : ""}`);
  },
  updateUser: (id: number, patch: { tier?: Tier; is_admin?: boolean }) =>
    fetchJSON<{ user: AuthUser }>(`/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  stats: () => fetchJSON<AdminStats>("/api/admin/stats"),
  usage: (days = 30) => fetchJSON<AdminUsage>(`/api/admin/usage?days=${days}`),
};

// Data types
export interface Overview {
  user_name: string;
  streak: number;
  today_score: number | null;
  today_goals_set: number;
  today_goals_completed: number;
  avg_7: number;
  total_days: number;
  error?: string;
}

export interface Score {
  date: string;
  score: number;
  goals_set: number;
  goals_completed: number;
  streak: number;
}

export interface Goal {
  date: string;
  goal_number: number;
  goal_text: string;
  is_completed: boolean;
}

export interface WeekDay {
  date: string;
  day_name: string;
  day_short: string;
  score: number | null;
  goals_set: number;
  goals_completed: number;
  streak: number;
}

export interface WeeklyData {
  days: WeekDay[];
  avg: number;
  week_start: string;
}

export interface Trends {
  scores: { date: string; score: number }[];
  best_streak: number;
  best_day: string | null;
  best_day_avg: number;
  worst_day: string | null;
  worst_day_avg: number;
  avg_goals: number;
  by_position: { position: number; rate: number; total: number; completed: number }[];
  day_avgs: Record<string, number>;
}

export const api = {
  overview: () => fetchJSON<Overview>("/api/overview"),
  scores: (days = 30) => fetchJSON<Score[]>(`/api/scores?days=${days}`),
  goals: (start?: string, end?: string, filter = "all") => {
    const params = new URLSearchParams({ filter });
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    return fetchJSON<Goal[]>(`/api/goals?${params}`);
  },
  weekly: (weekStart?: string) =>
    fetchJSON<WeeklyData>(`/api/weekly${weekStart ? `?week_start=${weekStart}` : ""}`),
  weeks: () => fetchJSON<string[]>("/api/weeks"),
  trends: (days = 30) => fetchJSON<Trends>(`/api/trends?days=${days}`),
};
