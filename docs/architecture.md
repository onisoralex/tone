# Architecture

**Status:** Not yet defined — fill in after tech stack is decided for this project.
**Last updated:** —

---

## Project Type

<!-- web-tool | web-saas | android-app | web+mobile | internal-tool -->
_To be determined._

## Deviation from Default Stack

<!-- List ONLY deviations from the Hive default stack (docs/tech-stack.md). If using the default, state "None." -->
_To be determined._

---

## Tech Stack (this project)

Refer to `C:\hive\docs\tech-stack.md` for the full Hive stack with rationale. Document deviations here.

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js / React Native | |
| Backend | Node.js / Express | |
| Database | PostgreSQL + Prisma | |
| Auth | Clerk (`@hive/auth`) | |
| Payments | Stripe (`@hive/billing`) | |
| Analytics | PostHog (`@hive/analytics`) | |
| Ads | AdMob / AdSense (`@hive/ads`) | If applicable |
| Deployment | Vercel + Railway | |
| Local dev | Docker | |

---

## URL / Route Structure

<!-- Describe the URL structure for web products. Reference docs/tech-stack.md Section 7 for conventions. -->
<!-- For web tools: does this live under /tools/*, /apps/*, /labs/*? Or is it a standalone domain? -->
_To be determined._

---

## Platform Packages Used

<!-- List which @hive/* packages this project consumes. -->
- [ ] `@hive/auth`
- [ ] `@hive/billing`
- [ ] `@hive/analytics`
- [ ] `@hive/ads`
- [ ] `@hive/ui`
- [ ] `@hive/email`
- [ ] `@hive/seo`

---

## Project Folder Structure

<!-- Describe the app/ folder structure once scaffolded. -->
_To be determined._

---

## Database Overview

<!-- List key tables / Prisma models and their purpose. -->
_To be determined._

---

## API Design

<!-- List key routes, their purpose, and auth requirements. -->
_To be determined._

---

## Monetization Model

<!-- Which model applies? Reference docs/platform/monetization.md. Note any deviations. -->
<!-- Options: free+ads | credits | one-time premium | subscription | donation-only | no monetization -->
_To be determined._

---

## Testing Approach

<!-- What test coverage is planned? See docs/tech-stack.md Section 3 for testing stack. -->
- Unit tests: Vitest (web) / Jest (RN)
- E2E: Playwright (web) / Detox (mobile) / manual checklist
- QA worker: spawn before each release

---

## Docker / Deployment

<!-- Services in docker-compose.yml, environment variables needed. -->
_To be determined._

---

## Environment Variables

<!-- List required .env keys. Never put values here — this file is committed. -->
_To be determined._
