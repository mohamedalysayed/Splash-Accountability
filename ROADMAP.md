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
- [ ] Inbound webhook for processing user replies
- [ ] Production WhatsApp Business API number

## Phase 3 — Auth + Dashboard (DONE)
- [x] JWT authentication (register / login / profile / phone linking)
- [x] Multi-user protected API endpoints
- [x] Next.js + Tailwind dashboard with login/register flow
- [x] Overview page — streak, score, trends, goal completion charts
- [x] Weekly view — heatmap tiles, detail table, completion rate
- [x] Goal history — filterable table, date range, common themes
- [x] Trends — completion patterns, best/worst days, goal position analysis
- [x] Light + dark mode support

## Phase 4 — Production Deployment
- [ ] Frontend hosting (Vercel / Netlify)
- [ ] Backend deployment (Railway / Fly.io / VPS)
- [ ] PostgreSQL for production database
- [ ] Docker Compose setup
- [ ] CI/CD pipeline
- [ ] Health monitoring and alerting

## Phase 5 — Multi-Channel Notifications
- [ ] Telegram bot integration
- [ ] Email digest (morning goals + evening score)
- [ ] Discord webhook integration
- [ ] Slack integration
- [ ] Push notifications via web dashboard

## Phase 6 — Intelligent Coaching
- [ ] Goal categorization (health, work, personal, learning)
- [ ] Pattern detection ("you always miss gym on Fridays")
- [ ] Adaptive messaging tone based on response patterns
- [ ] AI-powered goal suggestions based on history
- [ ] Weekly/monthly coaching summaries with actionable insights

## Phase 7 — Dashboard Enhancements
- [ ] Manual dark/light theme toggle
- [ ] Export data as CSV / PDF
- [ ] Mobile-responsive layout
- [ ] Real-time WebSocket updates
- [ ] Goal completion predictions
- [ ] Admin panel for user management

## Phase 8 — Gamification
- [ ] Achievement badges (7-day streak, 30-day streak, perfect week)
- [ ] Weekly leaderboard (multi-user)
- [ ] Streak recovery / freeze days
- [ ] Difficulty levels for goals
- [ ] Monthly challenges
