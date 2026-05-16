"use client";

import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="lp">
      {/* Nav */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <span className="lp-wordmark">Splash Accountability</span>
          <div className="lp-nav-right">
            <Link href="/login" className="lp-nav-link">Sign in</Link>
            <Link href="/register" className="lp-nav-cta">Get started</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="lp-hero">
        <h1 className="lp-display">
          Discipline,<br />delivered daily.
        </h1>
        <p className="lp-body-large">
          An AI accountability coach that lives in WhatsApp.<br />
          Set goals. Track streaks. Actually follow through.
        </p>
        <div className="lp-hero-actions">
          <Link href="/register" className="lp-pill">Start for $0.99/mo</Link>
          <a href="#how" className="lp-text-link">How it works</a>
        </div>
      </section>

      {/* iPhone */}
      <section className="lp-device-section">
        <div className="lp-iphone">
          {/* Side buttons */}
          <div className="lp-iphone-btn lp-iphone-btn-silent" />
          <div className="lp-iphone-btn lp-iphone-btn-volup" />
          <div className="lp-iphone-btn lp-iphone-btn-voldown" />
          <div className="lp-iphone-btn lp-iphone-btn-power" />
          {/* Frame */}
          <div className="lp-iphone-bezel">
            <div className="lp-iphone-island" />
            <div className="lp-iphone-screen">
              {/* WhatsApp chrome */}
              <div className="lp-wa-header">
                <div className="lp-wa-avatar">S</div>
                <div>
                  <div className="lp-wa-name">Splash Accountability</div>
                  <div className="lp-wa-status">online</div>
                </div>
              </div>
              {/* Conversation */}
              <div className="lp-wa-chat">
                <div className="lp-wa-date">Today</div>

                <div className="lp-msg lp-msg-in">
                  Good morning Mohamed! You&apos;re on a <strong>12-day streak</strong>. What are your top 3 goals today?
                  <span className="lp-msg-time">08:00</span>
                </div>

                <div className="lp-msg lp-msg-out">
                  1. Finish landing page{"\n"}2. Gym{"\n"}3. Ship voice note feature
                  <span className="lp-msg-time">08:02</span>
                </div>

                <div className="lp-msg lp-msg-in">
                  3 goals locked in. Don&apos;t forget your gym session and social media post! I&apos;ll check on you at 1pm.
                  <span className="lp-msg-time">08:02</span>
                </div>

                <div className="lp-msg lp-msg-out lp-msg-voice">
                  <div className="lp-voice-play">&#9654;</div>
                  <VoiceWave />
                  <span className="lp-voice-dur">0:12</span>
                  <span className="lp-msg-time">19:14</span>
                </div>

                <div className="lp-msg lp-msg-in">
                  All 3 goals done! Score: <strong>100%</strong>. 13-day streak &mdash; you&apos;re on fire, Mohamed. See you tomorrow.
                  <span className="lp-msg-time">19:15</span>
                </div>

                <div className="lp-wa-date">Yesterday</div>

                <div className="lp-msg lp-msg-out">
                  On Friday I spent 9 hours refactoring Splash-CFD
                  <span className="lp-msg-time">22:40</span>
                </div>

                <div className="lp-msg lp-msg-in">
                  Logged for Friday. That&apos;s serious deep work &mdash; score updated to <strong>100%</strong>.
                  <span className="lp-msg-time">22:40</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bento */}
      <section id="features" className="lp-section">
        <div className="lp-container">
          <h2 className="lp-heading">What it does</h2>
          <div className="lp-bento">
            <BentoCard
              title="Lives in WhatsApp"
              body="No app to install. Text your goals, report your wins. The bot meets you where you already are."
            />
            <BentoCard
              title="Voice notes"
              body="Talk about what you did. AI transcribes and logs each achievement. Works while you walk."
            />
            <BentoCard
              title="Smart check-ins"
              body="Morning, midday, evening. Three gentle nudges that keep your goals front of mind all day."
            />
            <BentoCard
              title="Backfill past days"
              body={<>&ldquo;On Friday I did 9 hours of refactoring&rdquo; &mdash; the bot understands dates and logs retroactively.</>}
            />
            <BentoCard
              title="Streaks &amp; scoring"
              body="Daily scores, streak counters, weekly summaries. Quantified accountability without the spreadsheet."
            />
            <BentoCard
              title="Beautiful dashboard"
              body="Score rings, trend charts, goal history. All your data, visualized. Dark and light mode."
            />
          </div>
        </div>
      </section>

      {/* How */}
      <section id="how" className="lp-section lp-section-muted">
        <div className="lp-container">
          <h2 className="lp-heading">How it works</h2>
          <div className="lp-steps">
            {[
              ["Send a message", "Text the WhatsApp bot. It creates your account automatically."],
              ["Set your goals", "Each morning, list what you want to accomplish. Type or voice note."],
              ["Stay on track", "The bot checks in at midday and evening. Smart, not annoying."],
              ["See your progress", "Link your phone to the dashboard. Scores, streaks, trends — all there."],
            ].map(([title, desc], i) => (
              <div key={i} className="lp-step">
                <div className="lp-step-num">{i + 1}</div>
                <div>
                  <h3 className="lp-step-title">{title}</h3>
                  <p className="lp-step-desc">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="lp-section">
        <div className="lp-container lp-pricing-container">
          <h2 className="lp-heading">Pricing</h2>
          <p className="lp-body-large lp-pricing-sub">One plan. Everything included.</p>
          <div className="lp-price-card">
            <div className="lp-price-row">
              <span className="lp-price">
                <span className="lp-price-dollar">$</span>0.99
              </span>
              <span className="lp-price-per">/month</span>
            </div>
            <p className="lp-price-note">Three cents a day.</p>
            <ul className="lp-includes">
              {[
                "Unlimited WhatsApp check-ins",
                "AI coaching & smart replies",
                "Voice note transcription",
                "Full analytics dashboard",
                "Streak tracking & daily scoring",
                "Backdate past achievements",
              ].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <Link href="/register" className="lp-pill lp-pill-wide">Get started</Link>
            <p className="lp-cancel">Cancel anytime.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="lp-section lp-section-muted lp-final">
        <div className="lp-container">
          <h2 className="lp-display-sm">Ready to follow through?</h2>
          <p className="lp-body-large">Your first check-in is one message away.</p>
          <Link href="/register" className="lp-pill">Start now</Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <span className="lp-wordmark lp-wordmark-sm">Splash Accountability</span>
        <span className="lp-footnote">Built with discipline.</span>
      </footer>
    </div>
  );
}

function BentoCard({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="lp-bento-card">
      <h3 className="lp-bento-title">{title}</h3>
      <p className="lp-bento-body">{body}</p>
    </div>
  );
}

function VoiceWave() {
  return (
    <svg viewBox="0 0 100 24" className="lp-wave" aria-hidden>
      {Array.from({ length: 36 }).map((_, i) => {
        const h = 3 + Math.sin(i * 0.55) * 6 + Math.sin(i * 1.1) * 3;
        return (
          <rect key={i} x={i * 2.8} y={12 - h / 2} width={1.5} height={h} rx={0.75} fill="currentColor" opacity={0.55} />
        );
      })}
    </svg>
  );
}
