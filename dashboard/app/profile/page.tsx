"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import {
  ApiError,
  authApi,
  billingApi,
  configApi,
  profileApi,
  type AuthUser,
  type PublicConfig,
  type Tier,
} from "@/lib/api";
import Avatar from "../components/Avatar";

const TIER_COPY: Record<Tier, { label: string; sub: string; cls: string }> = {
  free: {
    label: "Free",
    sub: "Daily check-ins, weekly view, goal tracking.",
    cls: "bg-muted/10 text-muted border-border",
  },
  premium: {
    label: "Premium",
    sub: "Trends, AI nudges, and all upcoming features.",
    cls: "bg-gradient-to-r from-amber-400 to-orange-500 text-white border-transparent",
  },
  lifetime: {
    label: "Lifetime",
    sub: "Founding member — everything Premium, forever.",
    cls: "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white border-transparent",
  },
};

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24)));
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function ProfilePage() {
  const { user, updateUser, loading } = useAuth();
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [appConfig, setAppConfig] = useState<PublicConfig | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nicknameTouched = useRef(false);

  useEffect(() => {
    if (user && !nicknameTouched.current) {
      setNickname(user.nickname ?? "");
    }
  }, [user]);

  // Fetch public WhatsApp/sandbox config once. Failure is non-fatal — the
  // cards fall back to generic copy.
  useEffect(() => {
    let cancelled = false;
    configApi.get().then(
      (c) => { if (!cancelled) setAppConfig(c); },
      () => { /* ignore — generic copy will show */ },
    );
    return () => { cancelled = true; };
  }, []);

  async function handleSaveNickname(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await profileApi.update({ nickname: nickname.trim() });
      updateUser(res.user);
      nicknameTouched.current = false;
      setMessage({ type: "success", text: "Profile updated" });
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : undefined;
      setMessage({ type: "error", text: detail || "Couldn't save profile" });
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage({ type: "error", text: "Use JPEG, PNG, or WebP" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: "error", text: "Max 2 MB" });
      return;
    }

    setUploading(true);
    setMessage(null);
    try {
      const res = await profileApi.uploadAvatar(file);
      updateUser(res.user);
      setMessage({ type: "success", text: "Photo updated" });
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : undefined;
      setMessage({ type: "error", text: detail || "Upload failed" });
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveAvatar() {
    if (!user?.avatar_url) return;
    setUploading(true);
    setMessage(null);
    try {
      const res = await profileApi.deleteAvatar();
      updateUser(res.user);
      setMessage({ type: "success", text: "Photo removed" });
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : undefined;
      setMessage({ type: "error", text: detail || "Couldn't remove photo" });
    } finally {
      setUploading(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="card p-8 max-w-2xl animate-fade-in">
        <div className="h-6 w-32 bg-muted/20 rounded animate-pulse mb-4" />
        <div className="h-4 w-64 bg-muted/10 rounded animate-pulse" />
      </div>
    );
  }

  const displayName = user.nickname || user.name;
  const showOnboarding =
    (user.tier ?? "free") === "free" &&
    !user.has_stripe_customer &&
    !user.phone;

  return (
    <div className="space-y-8 max-w-2xl animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          {showOnboarding ? `Welcome, ${displayName}.` : "Profile"}
        </h2>
        <p className="text-muted text-sm mt-1">
          {showOnboarding ? "Three steps to start tracking." : "How you appear on Splash"}
        </p>
      </div>

      {showOnboarding && <OnboardingCard config={appConfig} />}

      {message && (
        <div
          className={`text-sm rounded-2xl px-4 py-3 font-medium ${
            message.type === "success" ? "text-success badge-success" : "text-danger badge-danger"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Avatar + name card */}
      <div className="card p-7">
        <div className="flex items-center gap-5">
          <Avatar
            src={user.avatar_url}
            name={user.name}
            nickname={user.nickname}
            size={88}
            ring
          />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold text-foreground truncate">{displayName}</p>
            <p className="text-xs text-muted truncate">{user.email}</p>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="btn-secondary text-xs disabled:opacity-50"
              >
                {uploading ? "Uploading…" : user.avatar_url ? "Change photo" : "Upload photo"}
              </button>
              {user.avatar_url && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={uploading}
                  className="text-xs text-muted hover:text-danger transition-colors px-3 py-2 rounded-2xl"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={handleAvatarSelected}
            />
            <p className="text-[11px] text-muted-light mt-2">JPEG, PNG, or WebP. Max 2 MB.</p>
          </div>
        </div>
      </div>

      {/* Nickname */}
      <form onSubmit={handleSaveNickname} className="card p-7">
        <h3 className="text-sm font-semibold text-foreground mb-2">Nickname</h3>
        <p className="text-xs text-muted mb-5">
          Shown instead of your full name across the dashboard. Leave blank to use your real name.
        </p>
        <div className="flex gap-3">
          <input
            type="text"
            value={nickname}
            onChange={(e) => {
              nicknameTouched.current = true;
              setNickname(e.target.value);
            }}
            placeholder={user.name}
            maxLength={40}
            className="input flex-1"
          />
          <button
            type="submit"
            disabled={saving || nickname === (user.nickname ?? "")}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      {/* Plan / billing */}
      <SubscriptionCard user={user} />

      {/* WhatsApp — inline link/unlink so Google signups (no phone at register)
          can connect in one step instead of bouncing to /settings. The whole
          product flows through WhatsApp; this card has to be effortless. */}
      <WhatsAppCard user={user} onUpdated={updateUser} config={appConfig} />
    </div>
  );
}

function WhatsAppCard({
  user,
  onUpdated,
  config,
}: {
  user: AuthUser;
  onUpdated: (u: AuthUser) => void;
  config: PublicConfig | null;
}) {
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function handleLink(e: FormEvent) {
    e.preventDefault();
    const trimmed = phone.trim();
    if (!trimmed) return;
    // Light sanity check — backend stores raw, but at least flag obviously
    // wrong shapes (no digits at all, or no leading + which Twilio E.164
    // requires). Not a substitute for a real validator.
    if (!/^\+?\d[\d\s\-()]{6,}$/.test(trimmed)) {
      setErr("Use international format, e.g. +1 555 010 0000");
      return;
    }
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const res = await authApi.linkPhone(trimmed);
      onUpdated(res.user);
      setOk("WhatsApp linked. Say hi to the bot any time.");
      setPhone("");
    } catch (e) {
      const detail = e instanceof ApiError ? e.detail : undefined;
      setErr(detail || "Couldn't link that number. Try again?");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-7">
      <h3 className="text-sm font-semibold text-foreground mb-1">WhatsApp</h3>
      <p className="text-xs text-muted mb-5 leading-relaxed">
        Where the bot reaches you. Splash works through WhatsApp — without a
        linked number, check-ins won&apos;t arrive.
      </p>

      {/* Sandbox handshake instructions — render whenever the backend reports
          sandbox mode AND either the user hasn't linked yet, or they have but
          may not have opted in yet. Once opt-in is widely complete in prod we
          can hide for already-linked users. */}
      {config?.is_sandbox && config.whatsapp_number && (
        <SandboxJoinSteps
          number={config.whatsapp_number}
          joinCode={config.sandbox_join_code}
        />
      )}

      {user.phone ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="badge badge-success">
            <span className="status-dot bg-success" />
            {user.phone}
          </span>
          <a
            href="/settings"
            className="text-xs text-muted hover:text-accent transition-colors"
          >
            Change number →
          </a>
        </div>
      ) : (
        <form onSubmit={handleLink} className="space-y-3">
          <div className="flex gap-3">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 010 0000"
              autoComplete="tel"
              className="input flex-1"
              required
            />
            <button
              type="submit"
              disabled={saving || !phone.trim()}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {saving ? "Linking…" : "Link WhatsApp"}
            </button>
          </div>
          <p className="text-[11px] text-muted-light leading-relaxed">
            Include country code. We&apos;ll send your first check-in tomorrow
            morning in your local time zone.
          </p>
        </form>
      )}

      {err && (
        <div className="text-xs text-danger badge-danger rounded-xl px-3 py-2 font-medium mt-3">
          {err}
        </div>
      )}
      {ok && (
        <div className="text-xs text-success badge-success rounded-xl px-3 py-2 font-medium mt-3">
          {ok}
        </div>
      )}
    </div>
  );
}

function SubscriptionCard({ user }: { user: AuthUser }) {
  const { updateUser } = useAuth();
  const [busy, setBusy] = useState<"subscribe" | "portal" | "sync" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const tier = (user.tier ?? "free") as Tier;
  const tierCopy = TIER_COPY[tier];
  const status = user.subscription_status ?? null;
  const trialDays = daysUntil(user.trial_ends_at);
  const renewsOn = fmtDate(user.current_period_end);
  const hasCustomer = !!user.has_stripe_customer;

  async function openSubscribe() {
    setBusy("subscribe");
    setErr(null);
    try {
      const { url } = await billingApi.subscribeUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      const detail = e instanceof ApiError ? e.detail : undefined;
      setErr(detail || "Couldn't open checkout");
    } finally {
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy("portal");
    setErr(null);
    try {
      const { url } = await billingApi.portal();
      window.location.href = url;
    } catch (e) {
      const detail = e instanceof ApiError ? e.detail : undefined;
      setErr(detail || "Couldn't open billing portal");
      setBusy(null);
    }
  }

  async function handleSync() {
    setBusy("sync");
    setErr(null);
    try {
      const res = await billingApi.sync();
      updateUser(res.user);
      if (res.status.startsWith("synced")) {
        // status flipped → state is now correct, no error to show
      } else if (res.status === "no_customer" || res.status === "no_subscription") {
        setErr("No subscription found on Stripe yet. If you just paid, give it 30s and try again.");
      }
    } catch (e) {
      const detail = e instanceof ApiError ? e.detail : undefined;
      setErr(detail || "Couldn't sync from Stripe");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card p-7 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground mb-2">Plan</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${tierCopy.cls}`}
            >
              {tierCopy.label}
            </span>
            {status === "trialing" && trialDays != null && (
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-accent-soft text-accent">
                {trialDays}d trial left
              </span>
            )}
            {status === "past_due" && (
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-danger/10 text-danger">
                Payment failed
              </span>
            )}
            {status === "canceled" && (
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-muted/10 text-muted">
                Canceled
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-3 max-w-md">{tierCopy.sub}</p>
          {tier === "premium" && renewsOn && status === "active" && (
            <p className="text-[11px] text-muted-light mt-1">Renews {renewsOn}</p>
          )}
          {tier === "premium" && renewsOn && status === "trialing" && (
            <p className="text-[11px] text-muted-light mt-1">
              First charge {renewsOn} — cancel anytime before then for free.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 items-end">
          {tier === "free" && !hasCustomer && (
            <button
              onClick={openSubscribe}
              disabled={busy !== null}
              className="btn-primary text-xs whitespace-nowrap disabled:opacity-50"
            >
              {busy === "subscribe" ? "Opening Stripe…" : "Start 15-day free trial"}
            </button>
          )}
          {hasCustomer && (
            <button
              onClick={openPortal}
              disabled={busy !== null}
              className="btn-secondary text-xs whitespace-nowrap disabled:opacity-50"
            >
              {busy === "portal" ? "Opening…" : "Manage subscription"}
            </button>
          )}
          {/* Self-recovery: if Stripe knows about this user but our tier
              is still 'free' (e.g. a webhook missed), let them force-sync. */}
          {hasCustomer && tier === "free" && (
            <button
              onClick={handleSync}
              disabled={busy !== null}
              className="text-xs text-accent hover:text-accent-hover transition-colors px-3 py-2 rounded-2xl disabled:opacity-50"
            >
              {busy === "sync" ? "Syncing…" : "Sync from Stripe"}
            </button>
          )}
        </div>
      </div>

      {tier === "free" && !hasCustomer && (
        <div className="text-[11px] text-muted-light leading-relaxed">
          $0.99/mo after the trial. Cancel anytime from this page — no questions asked.
        </div>
      )}

      {err && (
        <div className="text-xs text-danger badge-danger rounded-xl px-3 py-2 font-medium">{err}</div>
      )}
    </div>
  );
}

function OnboardingCard({ config }: { config: PublicConfig | null }) {
  // Step 2 copy depends on whether the backend is on Twilio sandbox. In
  // sandbox mode users must DM "join <code>" to the shared sandbox number
  // before any message we send will reach them — without this hint the
  // whole product silently no-ops.
  const sandboxNumber = config?.whatsapp_number || "";
  const joinCode = config?.sandbox_join_code || "";
  const inSandbox = !!config?.is_sandbox;

  const step2Body = inSandbox && sandboxNumber ? (
    <>
      Save{" "}
      <span className="font-semibold text-foreground">{sandboxNumber}</span>{" "}
      on WhatsApp, then send{" "}
      <span className="font-mono text-accent">
        {joinCode ? `join ${joinCode}` : "join <code from Twilio>"}
      </span>{" "}
      to opt in. Check-ins arrive morning, midday, and night.
    </>
  ) : (
    <>We&apos;ll DM you check-ins at morning, midday, and night.</>
  );

  const steps = [
    {
      n: 1,
      title: "Activate your free trial",
      body: <>15 days free, then $0.99/mo. Cancel anytime — your card unlocks the bot.</>,
    },
    {
      n: 2,
      title: "Link your WhatsApp",
      body: step2Body,
    },
    {
      n: 3,
      title: "Send 3 goals tomorrow morning",
      body: <>Just reply to the bot. That&apos;s it — your streak starts.</>,
    },
  ];
  return (
    <div className="card p-7">
      <ol className="space-y-5">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-accent text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
              {s.n}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{s.title}</p>
              <p className="text-xs text-muted mt-1 leading-relaxed">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Renders the Twilio Sandbox handshake instructions: which number to DM and
 *  the exact "join <code>" phrase. Includes one-tap copy buttons for both so
 *  users don't fat-finger the code on mobile. */
function SandboxJoinSteps({
  number,
  joinCode,
}: {
  number: string;
  joinCode: string;
}) {
  const [copied, setCopied] = useState<"number" | "code" | null>(null);
  const phrase = joinCode ? `join ${joinCode}` : "";

  async function copy(value: string, which: "number" | "code") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <div className="rounded-2xl border border-accent/30 bg-accent-soft/40 p-4 mb-5 space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
        First time on WhatsApp? Two-step opt-in:
      </p>
      <ol className="space-y-2.5 text-xs text-foreground">
        <li className="flex items-start gap-2">
          <span className="text-muted-light">1.</span>
          <div className="flex-1 min-w-0">
            <span>Save this number on WhatsApp:</span>
            <button
              type="button"
              onClick={() => copy(number, "number")}
              className="ml-2 inline-flex items-center gap-1.5 font-mono text-accent hover:text-accent-hover transition-colors"
            >
              {number}
              <span className="text-[10px] text-muted-light">
                {copied === "number" ? "✓ copied" : "(copy)"}
              </span>
            </button>
          </div>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-muted-light">2.</span>
          <div className="flex-1 min-w-0">
            <span>DM it exactly:</span>{" "}
            {phrase ? (
              <button
                type="button"
                onClick={() => copy(phrase, "code")}
                className="inline-flex items-center gap-1.5 font-mono text-accent hover:text-accent-hover transition-colors"
              >
                {phrase}
                <span className="text-[10px] text-muted-light">
                  {copied === "code" ? "✓ copied" : "(copy)"}
                </span>
              </button>
            ) : (
              <span className="font-mono text-muted">
                join &lt;the code from your Twilio Sandbox page&gt;
              </span>
            )}
          </div>
        </li>
      </ol>
      <p className="text-[10px] text-muted-light leading-relaxed">
        Twilio confirms the opt-in. After that, link your number below and your
        first check-in lands tomorrow morning.
      </p>
    </div>
  );
}
