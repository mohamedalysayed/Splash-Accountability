"use client";

/**
 * "Continue with Google" button — wraps Google Identity Services'
 * GoogleLogin component and posts the returned credential to our backend.
 *
 * On success it calls the auth context's login() to persist the JWT and
 * route the user. New Google signups land on /profile so they immediately
 * see the trial CTA and the "Link WhatsApp" onboarding step (Google never
 * gives us a phone number, and phone is the whole product).
 *
 * Renders nothing if NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset — keeps the
 * email/password form usable in environments where Google isn't wired up.
 */

import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { authApi, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Props {
  /** "signin" or "signup" — controls the button label Google renders */
  mode?: "signin" | "signup";
  /** Where to send the user after a successful Google sign-in. Defaults
   *  to /profile so first-time Google users hit the trial CTA + phone
   *  linking onboarding step immediately. */
  redirectTo?: string;
  onError?: (msg: string) => void;
}

export default function GoogleSignInButton({
  mode = "signin",
  redirectTo = "/profile",
  onError,
}: Props) {
  const { login } = useAuth();
  const [busy, setBusy] = useState(false);

  // No client ID configured → skip rendering instead of throwing.
  // The provider would still mount but the button wouldn't work.
  const enabled = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!enabled) return null;

  return (
    <div className="w-full flex justify-center" aria-busy={busy}>
      <GoogleLogin
        onSuccess={async (cred) => {
          if (!cred.credential) {
            onError?.("Google sign-in returned no credential.");
            return;
          }
          setBusy(true);
          try {
            const res = await authApi.google(cred.credential);
            login(res.token, res.user, redirectTo);
          } catch (e) {
            const msg =
              e instanceof ApiError && e.detail
                ? e.detail
                : "Google sign-in failed. Please try again.";
            onError?.(msg);
          } finally {
            setBusy(false);
          }
        }}
        onError={() => onError?.("Google sign-in was cancelled or failed.")}
        text={mode === "signup" ? "signup_with" : "continue_with"}
        shape="pill"
        theme="outline"
        size="large"
        width="320"
      />
    </div>
  );
}
