"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { authApi } from "@/lib/api";

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const [phone, setPhone] = useState(user?.phone || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleLinkPhone(e: FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await authApi.linkPhone(phone.trim());
      const updated = (res as any).user ?? res;
      // Update auth context with new user data (now includes phone)
      updateUser(updated);
      setMessage({
        type: "success",
        text: "Phone linked! Your WhatsApp data has been merged into your account.",
      });
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err?.message?.includes("already linked")
          ? "This phone number is already linked to another account."
          : "Failed to link phone number. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-10 max-w-2xl animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Settings</h2>
        <p className="text-muted text-sm mt-1">Manage your account</p>
      </div>

      {/* Account info */}
      <div className="card p-7">
        <h3 className="text-sm font-semibold text-foreground mb-5">Account</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Name</span>
            <span className="text-sm font-medium text-foreground">{user?.name || "--"}</span>
          </div>
          <div className="border-t border-border" />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Email</span>
            <span className="text-sm font-medium text-foreground">{user?.email || "--"}</span>
          </div>
          <div className="border-t border-border" />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">WhatsApp</span>
            <span className="text-sm font-medium text-foreground">
              {user?.phone ? (
                <span className="badge badge-success">
                  <span className="status-dot bg-success" />
                  {user.phone}
                </span>
              ) : (
                <span className="badge badge-muted">Not linked</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Link WhatsApp */}
      <div className="card p-7">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          {user?.phone ? "Update WhatsApp Number" : "Link WhatsApp Number"}
        </h3>
        <p className="text-xs text-muted mb-5">
          {user?.phone
            ? "Change the phone number connected to your account."
            : "Connect your WhatsApp number to see all your check-in data, goals, and scores from the bot on this dashboard. Any history from your WhatsApp conversations will appear immediately."}
        </p>

        {message && (
          <div
            className={`text-sm rounded-2xl px-4 py-3 font-medium mb-5 ${
              message.type === "success" ? "text-success badge-success" : "text-danger badge-danger"
            }`}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleLinkPhone} className="flex gap-3">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+41761234567"
            className="input flex-1"
            required
          />
          <button
            type="submit"
            disabled={saving || !phone.trim()}
            className="btn-primary whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Linking...
              </span>
            ) : user?.phone ? (
              "Update"
            ) : (
              "Link WhatsApp"
            )}
          </button>
        </form>

        <p className="text-[11px] text-muted-light mt-3">
          Use the full international format including country code (e.g. +41 for Switzerland).
        </p>
      </div>

      {/* How it works */}
      {!user?.phone && (
        <div className="card p-7">
          <h3 className="text-sm font-semibold text-foreground mb-4">How it works</h3>
          <div className="space-y-3">
            {[
              { step: "1", text: "Send a message to the Splash bot on WhatsApp" },
              { step: "2", text: "Enter the same phone number here and click Link" },
              { step: "3", text: "All your goals, scores, and streaks appear on this dashboard instantly" },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-accent-soft text-accent flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                  {item.step}
                </div>
                <p className="text-sm text-muted">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
