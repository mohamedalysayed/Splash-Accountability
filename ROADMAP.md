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

## Phase 5 — Voice Notes + Audio (NEXT)
- [ ] Receive WhatsApp voice notes via Twilio media URLs
- [ ] Transcribe audio using Claude's native audio input or Whisper
- [ ] Process transcriptions through the same AI intent classifier
- [ ] Support mixed media — voice + text in the same conversation
- [ ] Voice-to-goal: speak your achievements and have them logged automatically

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
