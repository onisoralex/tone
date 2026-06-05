# Project Brief — Tone

The Mind reads this file at the start of every session. Keep it non-technical and high-level — the "what and why." Technical decisions belong in `mind/decisions.md`; implementation details belong in `docs/architecture.md`.

---

## What we're building

**Tone** is a focused Android frequency generator app. It generates audio tones at precise, user-defined frequencies with minimal friction — designed for live sound engineers, musicians, electricians, and anyone who needs a test tone immediately and cannot afford to wait.

The core design constraint is speed-to-tone: the user opens the app and is generating a frequency within seconds, with no interstitials, no onboarding, no consent dialogs blocking the main action.

Ads are present but positioned to never block or delay the core function. This is the primary differentiator versus every other free frequency generator on the Play Store.

## Who it's for

- **Live sound engineers and AV technicians** — identifying feedback frequencies on a PA system, sweeping a room, tuning a system. Time pressure is real; ads that interrupt are unacceptable in this context.
- **Musicians** — tuning instruments, generating reference pitches.
- **Electronics and audio hobbyists** — testing speakers, amplifiers, circuits.
- **Sleep and focus users** — white, pink, and brown noise for sleep masking, tinnitus relief, or concentration.
- **General users** — anyone who needs a quick tone or noise and doesn't want a subscription.

## Goals

- Generate a tone at any frequency the user sets, instantly on play
- Support precise frequency input (type a value, not just a slider)
- Support common waveforms (sine, square, sawtooth, triangle) and noise types (white, pink, brown)
- High audio quality — no artifacts, no gaps, continuous and stable generation
- Monetise via non-intrusive banner ads — never block the core UI
- Offer a "support the solo dev" in-app donation via Google Play Billing; removing ads is the thank-you bonus
- Publish to Google Play as a free app
- First revenue milestone: any paying user

## Key constraints

- Android only (no iOS in v1 — Play Store developer account is $25 one-time; App Store is $99/year)
- React Native + Expo (platform convention for mobile)
- No backend server required — fully client-side
- Ads via AdMob (`@hive/ads`); in-app "remove ads" purchase via Google Play Billing only (mandatory per Google policy — Stripe is not permitted for in-app digital goods on the Play Store)
- Monetisation framing: "support the solo dev" donation with ad removal as the thank-you; not a paywall
- Ad placement rules per `platform/docs/ads-policy.md`
- App must be usable before any ad has loaded — ads are non-blocking
- High-quality audio generation required — stable, gap-free, suitable for noise and waveform synthesis

## Out of scope (v1)

- iOS support
- Frequency sweep / automated sweep mode (v2 candidate)
- Multi-tone / chord generation
- Recording or export
- Spectrum analyser or visualiser
- Offline pitch detection / tuner input
- Stripe or web-based payments (in-app purchases must use Play Billing)

## References

- Platform packages: `projects/platform/`
- Ad placement policy: `projects/platform/docs/ads-policy.md`
- Monetisation model: `projects/platform/docs/monetization.md`
