# Splash Accountability — Roadmap

## Phase 1 — Core Agent (DONE)
- [x] AI-powered daily check-in scheduler (morning / midday / evening)
- [x] Natural language goal parsing and completion detection
- [x] SQLite database with full schema (users, goals, check-ins, scores, message log)
- [x] Console messaging mode for local development
- [x] Streak tracking, daily scoring, weekly summaries
- [x] Graceful restart with catch-up on missed check-ins
- [x] Rate limiting, deduplication, structured logging

## Phase 2 — WhatsApp Integration (DONE)
- [x] Twilio WhatsApp sandbox integration
- [x] Outbound message delivery to users
- [x] Multi-user agent scheduler with per-user timezone support
- [x] Inbound webhook for processing user replies
- [x] ngrok auto-tunneling for local development
- [x] Smart freeform message handling (AI intent classification)
- [x] Anytime goal setting and achievement logging outside check-in windows
- [x] Reply rate-limiting bypass for inbound conversations
- [ ] Production WhatsApp Business API number

## Phase 3 — Auth + Dashboard (DONE)
- [x] JWT authentication (register / login / profile / phone linking)
- [x] Multi-user protected API endpoints
- [x] Next.js + Tailwind dashboard with login/register flow
- [x] Overview page — streak, score ring, trends, goal completion charts
- [x] Weekly view — animated day tiles, detail table, completion rate ring
- [x] Goal history — filterable table, date range, common themes
- [x] Trends — completion patterns, best/worst days, goal position analysis
- [x] Glassmorphic design — frosted glass cards, mesh gradient backgrounds, glow effects, spring animations
- [x] Light + dark mode support (system preference)

## Phase 4 — Recurring Reminders + Habits (DONE)
- [x] Configurable recurring daily reminders (gym, social media, etc.)
- [x] Recurring reminders woven into morning check-in messages
- [x] Report achievements intent — log completed goals anytime via WhatsApp
- [ ] Habit streaks — track per-habit completion independently
- [ ] Habit frequency targets (e.g. gym 3-4x/week, not necessarily daily)
- [ ] Dashboard habits view — visualize per-habit streaks and consistency

---

## Phase 4.5 — Google OAuth + User Account Merge (NEXT)

Two tightly coupled features: Google sign-in for the dashboard, and proper merging of WhatsApp-auto-created users with dashboard accounts.

### Current State (the problem)

**Two separate user creation paths exist today:**
1. **WhatsApp path** (`webhook.py:436-438`): When someone texts the bot, `get_or_create_user(phone, phone, tz)` in `db.py:160` auto-creates a user with `phone` as both the phone and name, no email, no password. This user gets goals, scores, check-ins.
2. **Dashboard path** (`webhook.py:160-170`): `create_user_with_email(email, pw_hash, name, phone)` in `db.py:483` creates a separate user with email + password.

**The link-phone endpoint (`webhook.py:194-209`) is broken**: It only sets the phone column on the dashboard user. It does NOT move goals/scores/check-ins from the WhatsApp-created user. So a user who texts first and registers later sees an empty dashboard — all their data belongs to a different user ID.

### Task A: Google OAuth Login

**Goal**: Add "Sign in with Google" to login and register pages. No separate Google Cloud project needed — use Google's client-side ID token flow.

#### A1. Get Google OAuth Client ID
- Go to https://console.cloud.google.com → APIs & Services → Credentials
- Create an OAuth 2.0 Client ID (Web application type)
- Set authorized JavaScript origins: `http://localhost:3000`
- Copy the Client ID

#### A2. Add config (`config.py`)
```python
# Add to Settings class:
GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
```
Add to `.env`:
```
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
```

#### A3. Add backend endpoint (`webhook.py`)

Add `POST /api/auth/google` endpoint. Full implementation:

```python
# Add import at top of webhook.py:
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

# Add to requirements.txt:
# google-auth>=2.0

@app.post("/api/auth/google")
def auth_google(body: dict):
    """Authenticate with Google ID token. Creates account if first login."""
    token = body.get("credential")
    if not token:
        raise HTTPException(status_code=400, detail="Missing credential")

    try:
        idinfo = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    email = idinfo["email"]
    name = idinfo.get("name", email.split("@")[0])

    # Find existing user by email, or create new one
    user = get_user_by_email(email)
    if not user:
        # No password hash for Google users — they auth via Google only
        user = create_user_with_email(email, "", name)

    jwt_token = create_token(user.id, user.email)
    return {"token": jwt_token, "user": _user_to_dict(user)}
```

**Key details:**
- Google users have an empty `password_hash` — they can only sign in via Google
- The `/api/auth/login` endpoint already checks `if not user.password_hash` and rejects, so Google-only users can't log in with email/password (correct behavior)
- If a user registered with email first, then signs in with Google using the same email, it finds the existing account (no duplicate)

#### A4. Install Python dependency
```bash
pip install google-auth
# Add to requirements.txt: google-auth>=2.0
```

#### A5. Add frontend Google button (`dashboard/app/login/page.tsx` and `register/page.tsx`)

Use Google's Sign In With Google HTML API (no npm package needed):

```typescript
// Add to dashboard/lib/api.ts:
export const authApi = {
  // ... existing methods ...
  google: (credential: string) =>
    fetchJSON<AuthResponse>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),
};
```

In `login/page.tsx`, add after the existing form:

```tsx
// Add a Google Sign-In button using the Google Identity Services library
// Load the script in dashboard/app/layout.tsx:
// <Script src="https://accounts.google.com/gsi/client" strategy="beforeInteractive" />

// In the login page, add a div after the form:
<div className="relative my-6">
  <div className="absolute inset-0 flex items-center">
    <div className="w-full border-t border-border" />
  </div>
  <div className="relative flex justify-center text-xs">
    <span className="bg-card px-4 text-muted-light uppercase tracking-wider">or</span>
  </div>
</div>

<GoogleSignInButton />
```

Create `dashboard/app/components/GoogleSignInButton.tsx`:
```tsx
"use client";
import { useEffect, useRef } from "react";
import { authApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function GoogleSignInButton() {
  const { login } = useAuth();
  const btnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response: { credential: string }) => {
        try {
          const res = await authApi.google(response.credential);
          login(res.token, res.user);
        } catch {
          console.error("Google sign-in failed");
        }
      },
    });

    if (btnRef.current) {
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: "outline",
        size: "large",
        width: "100%",
        text: "signin_with",
      });
    }
  }, [login]);

  return <div ref={btnRef} className="flex justify-center" />;
}
```

Add to `dashboard/.env.local`:
```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
```

Add to `dashboard/app/layout.tsx` in `<head>`:
```tsx
<Script src="https://accounts.google.com/gsi/client" strategy="beforeInteractive" />
```

Add `google` type declaration in `dashboard/global.d.ts`:
```typescript
interface Window {
  google: {
    accounts: {
      id: {
        initialize: (config: any) => void;
        renderButton: (element: HTMLElement, config: any) => void;
      };
    };
  };
}
```

### Task B: WhatsApp User Merge (Phone Linking)

**Goal**: When a dashboard user links their phone number, merge all data from the WhatsApp-auto-created user into their account.

#### B1. Rewrite `link_phone_to_user()` in `db.py`

Replace the current function (line 504) with a proper merge:

```python
def link_phone_to_user(user_id: int, phone: str):
    """Link a phone number to a user, merging data from any phone-only user."""
    with get_session() as s:
        target = s.query(User).filter(User.id == user_id).first()
        if not target:
            return

        # Find the WhatsApp-auto-created user with this phone
        phone_user = s.query(User).filter(
            User.phone == phone,
            User.id != user_id,
        ).first()

        if phone_user:
            # Transfer all data from phone_user to target
            s.query(Goal).filter(Goal.user_id == phone_user.id).update(
                {"user_id": user_id}, synchronize_session="fetch"
            )
            s.query(CheckIn).filter(CheckIn.user_id == phone_user.id).update(
                {"user_id": user_id}, synchronize_session="fetch"
            )
            s.query(DailyScore).filter(DailyScore.user_id == phone_user.id).update(
                {"user_id": user_id}, synchronize_session="fetch"
            )
            s.query(MessageLog).filter(MessageLog.user_id == phone_user.id).update(
                {"user_id": user_id}, synchronize_session="fetch"
            )

            # Deactivate the orphan phone-only user
            phone_user.is_active = False
            phone_user.phone = None  # release the phone number
            logger.info(
                "Merged user %d (phone=%s) into user %d (%s). "
                "Transferred goals, check-ins, scores, messages.",
                phone_user.id, phone, user_id, target.email,
            )

        # Set the phone on the target user
        target.phone = phone
        logger.info("Linked phone %s to user %d", phone, user_id)
```

**Key details:**
- Transfers ALL foreign-keyed data: goals, check_ins, daily_scores, message_log
- Deactivates the orphan user (doesn't delete — preserves audit trail)
- Releases the phone number from the orphan so it's not duplicated
- If no orphan phone user exists (user is linking a fresh number), just sets the phone

#### B2. Update the webhook endpoint (`webhook.py:194-209`)

No changes needed to the endpoint itself — it already calls `link_phone_to_user()`. The function rewrite in B1 handles everything.

#### B3. Handle edge case in webhook inbound (`webhook.py:436-438`)

When a WhatsApp message comes in from a phone that was already merged, the phone now belongs to the dashboard user (the merge target). So `get_user_by_phone(phone)` will return the dashboard user directly. No code change needed — this works automatically after the merge.

#### B4. Add "Link Phone" UI to dashboard

Currently there's no UI for phone linking. Add a profile/settings section:

Create `dashboard/app/settings/page.tsx`:
```tsx
// Simple page with:
// - Current user info (name, email)
// - Phone number input + "Link WhatsApp" button
// - Calls authApi.linkPhone(phone)
// - Shows success/error state
```

Add "Settings" to the sidebar nav in `dashboard/app/components/Sidebar.tsx`:
```typescript
// Add to the nav array:
{ href: "/settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" }
```

### Implementation Order

**Do these in order — each step is independently testable:**

1. **A2** — Add `GOOGLE_CLIENT_ID` to config.py and .env (2 min)
2. **A4** — `pip install google-auth`, update requirements.txt (1 min)
3. **A3** — Add `POST /api/auth/google` endpoint to webhook.py (10 min)
4. **A5** — Add Google button to frontend: layout script tag, component, login/register pages (20 min)
5. **Test Google login** — create account, sign in, verify JWT works (5 min)
6. **B1** — Rewrite `link_phone_to_user()` in db.py with merge logic (15 min)
7. **B4** — Add settings page with phone linking UI (15 min)
8. **Test merge** — link phone, verify goals/scores appear on dashboard (5 min)

**Total estimated scope**: ~200 lines Python, ~80 lines TypeScript, ~20 lines config.

### Testing Checklist

- [ ] Google sign-in creates new user if email not in DB
- [ ] Google sign-in finds existing user if email matches
- [ ] Google-only user cannot log in via email/password form
- [ ] Email user can also sign in via Google (same email)
- [ ] Phone linking transfers goals from WhatsApp user to dashboard user
- [ ] Phone linking transfers scores, check-ins, message logs
- [ ] WhatsApp orphan user is deactivated after merge
- [ ] New WhatsApp messages from merged phone go to dashboard user
- [ ] Settings page shows current phone, allows linking new one

---

## Phase 5 — Voice Notes + Audio (DONE)
- [x] Receive WhatsApp voice notes via Twilio media URLs
- [x] Transcribe audio using Claude's native audio input (base64)
- [x] Process transcriptions through the same AI intent classifier
- [x] Support mixed media — voice + text in the same conversation (caption + transcript merged)
- [x] Voice-to-goal: speak your achievements and have them logged automatically

## Phase 6 — Production Deployment
- [ ] Frontend hosting (Vercel / Netlify)
- [ ] Backend deployment (Railway / Fly.io / VPS)
- [ ] PostgreSQL for production database
- [ ] Docker Compose setup
- [ ] CI/CD pipeline
- [ ] Health monitoring and alerting
- [ ] No laptop required — runs 24/7 in the cloud

## Phase 7 — Multi-Channel Notifications
- [ ] Telegram bot integration
- [ ] Email digest (morning goals + evening score)
- [ ] Discord webhook integration
- [ ] Slack integration
- [ ] Push notifications via web dashboard

## Phase 8 — Intelligent Coaching
- [ ] Goal categorization (health, work, personal, learning)
- [ ] Pattern detection ("you always miss gym on Fridays")
- [ ] Adaptive messaging tone based on response patterns
- [ ] AI-powered goal suggestions based on history
- [ ] Weekly/monthly coaching summaries with actionable insights

## Phase 9 — Dashboard Enhancements
- [ ] Manual dark/light theme toggle
- [ ] Export data as CSV / PDF
- [ ] Mobile-responsive layout
- [ ] Real-time WebSocket updates
- [ ] Goal completion predictions
- [ ] Admin panel for user management

## Phase 10 — Gamification
- [ ] Achievement badges (7-day streak, 30-day streak, perfect week)
- [ ] Weekly leaderboard (multi-user)
- [ ] Streak recovery / freeze days
- [ ] Difficulty levels for goals
- [ ] Monthly challenges
