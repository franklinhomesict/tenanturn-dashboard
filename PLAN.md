# Engagement Tracking — Plan

Branch: `claude/add-engagement-tracking-cV1VP`

## Goal
Know whether anyone is using the Tenanturn estimator, and how far they get.

## Current state (2026-08-17)
- No analytics wired in. `App.jsx` has zero tracking calls.
- Only local telemetry is `localStorage` (`tenanturn_draft`, `tenanturn_warning_seen`) — never leaves the browser.
- App is a single-page React (Vite) app served statically.
- **Hosted on Vercel** (project `tenanturn-estimator` in the `ian-5676s-projects` team) — discovered from the deploy bot comment on PR #1. This matters: Vercel Analytics can give a "has anyone used this?" answer with **zero code changes** — toggle it on in the Vercel dashboard.

## Open questions (need Ian's answer before coding)
- [ ] Where should events go? Options:
  - **Vercel Analytics (recommended)** — one toggle in the Vercel dashboard, no code, gives page views + top pages. Free tier is generous. Best first step; can be augmented with custom events later via `@vercel/analytics`.
  - Plausible / Umami (hosted, privacy-friendly, ~free at this volume)
  - Google Analytics 4 (free, more features, cookie banner concerns)
  - Roll our own: POST to a small serverless endpoint we control
- [ ] What counts as "engagement"? Draft list:
  - [ ] App loaded
  - [ ] Walkthrough started (address entered)
  - [ ] Room added (which room)
  - [ ] Item added (from catalog vs custom)
  - [ ] Voice input used
  - [ ] Draft resumed
  - [ ] Estimate sent / copied to clipboard
- [ ] Any privacy constraint? (Field workers only, so probably not — confirm.)

## Implementation checklist (fills in once questions answered)
- [ ] Add tracking library / write tiny fetch helper
- [ ] Wire events at the trigger points above
- [ ] Add a build-time env var so tracking is off in local dev
- [ ] Verify events land in the dashboard from a real device
- [ ] Document how to view the numbers in `README` (or here)

## How to resume
Open the branch, read this file, answer any unchecked question in a message, then say **"resume from PLAN.md"** and I'll pick up at the next unchecked box.
