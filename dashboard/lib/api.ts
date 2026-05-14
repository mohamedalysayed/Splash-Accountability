const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

function clearTokenAndRedirect() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("auth_token");
  window.location.href = "/login";
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

  if (res.status === 401) {
    clearTokenAndRedirect();
    throw new Error("Unauthorized");
  }

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Auth types
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
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

  me: () => fetchJSON<AuthUser>("/api/auth/me"),

  linkPhone: (phone: string) =>
    fetchJSON<{ success: boolean }>("/api/auth/link-phone", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
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
