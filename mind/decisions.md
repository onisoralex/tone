# Decisions

Append-only. One entry per significant decision.

Format:
```
## <slug or topic> — <date>
**Decision:** <what was decided>
**Rejected:** <what was considered and not chosen>
**Why:** <rationale>
```

---

## payment-method — 2026-05-25
**Decision:** Google Play Billing only for in-app "remove ads" purchase. No Stripe in-app.
**Rejected:** Offering Stripe as an alternative payment option inside the app.
**Why:** Google Play policy mandates Play Billing for all in-app digital goods. Circumventing it results in app rejection or removal (see: Epic v. Google). Stripe remains an option only for out-of-app donation pages with no in-app benefit attached.

## audio-engine — 2026-05-25
**Decision:** `react-native-audio-api` (Software Mansion, v0.12.2) for audio generation.
**Rejected:** Hidden WebView + Web Audio API (300–800 ms boot latency, audio dropout when WebView loses focus — fails hard UX requirement); `expo-av` / `expo-audio` (playback-only, no PCM write API); `react-native-sound` (file playback only, no synthesis).
**Why:** `react-native-audio-api` implements Web Audio API in native C++/JNI on Android — audio runs on a native thread, not the JS bridge. <10 ms latency reported. OscillatorNode covers all four waveforms natively; AudioBufferSourceNode covers noise types. Works in managed Expo via EAS Build (no ejecting). Actively maintained by Software Mansion (makers of Reanimated).

## iap-library — 2026-05-25
**Decision:** `react-native-purchases` (RevenueCat) for Google Play Billing.
**Rejected:** `react-native-iap` (Kotlin 2.2 version conflict with expo-modules-core on SDK 56 — build fragility); `expo-iap` (Android acknowledgment reliability issues admitted by maintainer as of May 2026).
**Why:** RevenueCat handles receipt validation and entitlement management without a custom backend. Free tier covers up to $2,500 MRR. Expo's own docs recommend it as of 2026. RevenueCat is a third-party dependency, so entitlement state is also persisted locally (expo-secure-store) so offline use works without a network call.

## monetisation-framing — 2026-05-25
**Decision:** "Support the solo dev" donation framing via a single Play Billing in-app purchase. Ad removal is the thank-you bonus, not a hard paywall.
**Rejected:** Subscription model; hard "premium" paywall.
**Why:** Softer ask, more personal for a solo developer, and giving users something tangible (no ads) incentivises conversion better than goodwill alone. One-time purchase is simpler than a subscription for a utility app.

## audio-scope — 2026-05-25
**Decision:** App generates waveforms (sine, square, sawtooth, triangle) AND noise types (white, pink, brown). High audio quality is a core requirement.
**Rejected:** Sine-only or low-quality PCM generation.
**Why:** Noise generation opens a second large user segment (sleep, focus, tinnitus masking) with almost no additional complexity. High quality is non-negotiable given the PA/engineering use case — artifacts are unacceptable in that context.
