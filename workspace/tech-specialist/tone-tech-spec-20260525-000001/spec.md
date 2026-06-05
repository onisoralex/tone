# Tone App — Technical Architecture Specification

**Task slug:** tone-tech-spec-20260525-000001  
**Target Expo SDK:** 56 (React Native 0.85, React 19.2 — stable release May 21, 2026)  
**Platform:** Android only (v1)  
**Workflow:** Expo managed workflow via EAS Build (no ejecting)

---

## 1. Audio Generation Approach

### Assessment of candidates

#### 1a. Web Audio API via a hidden WebView

A hidden `<WebView>` loads an inline HTML document that uses the browser's native Web Audio API. React Native sends commands (`play`, `stop`, `setFrequency`, `setWaveform`) via `postMessage`; the WebView sends status back via `onMessage`.

**Expo managed:** Yes — `react-native-webview` works in managed Expo without ejecting.  
**Latency:** Poor. WebView bootstrap time on Android (Chromium WebView) is 300–800 ms on first load. Even after the page is loaded, `postMessage` crosses a JS bridge and adds ~10–50 ms per command. Audio *context* resume on Android requires a user gesture inside the WebView, adding another async round-trip. Violates the zero-latency requirement.  
**Gap risk:** Web Audio API in WebView on Android is known to drop audio when the WebView loses focus, the screen dims, or the system audio focus shifts. Not suitable for continuous generation.  
**Noise support:** Yes — `AudioBufferSourceNode` looping a generated buffer works fine.  
**Frequency precision:** Yes — Web Audio API `OscillatorNode.frequency` is a float AudioParam.  
**Verdict:** Fails the latency requirement. Eliminated.

#### 1b. expo-av / expo-audio with PCM buffer streaming

`expo-av` (deprecated as of SDK 53 and unsupported from SDK 54+) and its successor `expo-audio` are playback-oriented libraries. They play files or network streams. Neither exposes a raw PCM write API that allows synthesizing audio sample-by-sample in JS and streaming it to the audio hardware in real time. The Expo GitHub discussions confirm that raw PCM playback (as opposed to recording) is not supported — audio samples are handled in the C++ Audio HAL on Android and not exposed to the JS layer.

**Verdict:** Architecturally unsuitable — these are file/stream playback libraries, not real-time synthesis engines.

#### 1c. react-native-sound

A file-playback library wrapping `MediaPlayer` (Android) and `AVAudioPlayer` (iOS). Does not support real-time synthesis at all. Plays pre-loaded files only.

**Verdict:** Not applicable. Eliminated.

#### 1d. react-native-audio-api (Software Mansion) ← RECOMMENDED

A native module by Software Mansion that implements the Web Audio API specification directly in native code (C++/JNI on Android). It is NOT a WebView — the audio graph runs entirely on native audio threads, bypassing the JS bridge for sample generation.

- **Current version:** 0.12.2 (published May 12, 2026). 74 releases total; actively maintained.
- **Expo managed:** Yes — works via Expo managed workflow with an EAS Build (dev client). Does NOT work in Expo Go (contains native code). Uses an Expo config plugin — no manual native file editing required.
- **Latency:** < 10 ms from API call to first audio sample on Android (reported by production users of the Odisei Play app). The audio context runs on a dedicated native audio thread, not the JS thread.
- **Gap risk:** Minimal. The oscillator runs on the native audio thread; JS activity does not interrupt it. This is the same model as the browser Web Audio API.
- **OscillatorNode waveform types:** `sine`, `square`, `sawtooth`, `triangle` (full Web Audio API spec parity). Custom waveforms via `setPeriodicWave()` also available.
- **Noise support:** Yes. The library's own documentation includes a noise generation guide using `AudioBufferSourceNode` with pre-filled `Float32Array` buffers. All three types (white, pink, brown) are supported this way.
- **Frequency precision:** Yes — `OscillatorNode.frequency` is an a-rate `AudioParam` (float, arbitrary precision).
- **Gap-free stop/start:** An `OscillatorNode` can only be started once. To change frequency or waveform while playing, update `oscillator.frequency.value` directly — no need to stop and restart. To change waveform type, a new node must be created. The recommended pattern is: create a new oscillator, connect it, start it, stop-and-disconnect the previous one.
- **Maintenance:** Actively maintained by Software Mansion (makers of Reanimated, Gesture Handler). 772 stars, 65 forks, 14 open issues.

**Verdict: Use `react-native-audio-api`.**

### Assumption

The latency figure is from third-party reporting and Software Mansion's own benchmarks. The Developer should test on a low-end Android device (e.g. entry-level Android 10 phone) to verify the < 10 ms claim before shipping. If latency exceeds 50 ms on target hardware, the fallback is the WebView approach with pre-loaded context — acceptable only if the WebView is pre-warmed at app start, not on demand.

---

## 2. Waveform and Noise Synthesis

### 2a. OscillatorNode waveforms (sine, square, sawtooth, triangle)

All four waveforms are handled natively by `OscillatorNode`. Set the `type` property:

```js
const ctx = new AudioContext();
const osc = ctx.createOscillator();
osc.type = "sine"; // "sine" | "square" | "sawtooth" | "triangle"
osc.frequency.value = 440.0; // Hz, arbitrary float
osc.connect(ctx.destination);
osc.start();
```

To change frequency while playing, set the value directly — no node restart needed:

```js
osc.frequency.value = 432.7; // takes effect immediately
```

To change waveform type while playing, create a new oscillator (see pattern in section 5).

**Mathematical definitions** (what the native layer computes per sample, for reference):

| Waveform | Formula (t = phase 0..2π) |
|---|---|
| Sine | `sin(t)` |
| Square | `sign(sin(t))` — +1 for first half-period, -1 for second |
| Sawtooth | `2 * (t / 2π - floor(t / 2π + 0.5))` — ramps from -1 to +1 |
| Triangle | `2 * abs(sawtooth) - 1` |

The native layer handles these; the Developer does not implement these formulas — they are provided here for conceptual grounding only.

### 2b. White noise

White noise is uncorrelated random samples, uniform distribution over [-1, 1].

Algorithm: Fill a `Float32Array` buffer of length `2 * sampleRate` samples with `Math.random() * 2 - 1`. Load into an `AudioBuffer`, play via `AudioBufferSourceNode` with `loop = true`.

```js
const bufferSize = 2 * ctx.sampleRate;
const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
const data = buffer.getChannelData(0);
for (let i = 0; i < bufferSize; i++) {
  data[i] = Math.random() * 2 - 1;
}
const source = ctx.createBufferSource();
source.buffer = buffer;
source.loop = true;
source.connect(ctx.destination);
source.start();
```

### 2c. Pink noise

Pink noise has equal energy per octave (-3 dB/octave). Use Paul Kellet's refined method — a cascaded IIR approximation applied to white noise.

Algorithm: iterate over the buffer, maintaining six filter state variables (`b0`–`b5`):

```js
const bufferSize = 2 * ctx.sampleRate;
const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
const data = buffer.getChannelData(0);

let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
for (let i = 0; i < bufferSize; i++) {
  const white = Math.random() * 2 - 1;
  b0 = 0.99886 * b0 + white * 0.0555179;
  b1 = 0.99332 * b1 + white * 0.0750759;
  b2 = 0.96900 * b2 + white * 0.1538520;
  b3 = 0.86650 * b3 + white * 0.3104856;
  b4 = 0.55000 * b4 + white * 0.5329522;
  b5 = -0.7616 * b5 - white * 0.0168980;
  data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
  b6 = white * 0.115926;
}

const source = ctx.createBufferSource();
source.buffer = buffer;
source.loop = true;
source.connect(ctx.destination);
source.start();
```

The multiply by `0.11` normalises the output to roughly [-1, 1].

**Source:** Paul Kellet's refined pink noise algorithm — the same implementation confirmed by the react-native-audio-api noise generation guide.

### 2d. Brown noise (Brownian / red noise)

Brown noise is the cumulative integral of white noise — each sample is the previous sample plus a small random step. It has -6 dB/octave rolloff (stronger low-frequency emphasis than pink).

Algorithm:

```js
const bufferSize = 2 * ctx.sampleRate;
const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
const data = buffer.getChannelData(0);

let lastOut = 0;
for (let i = 0; i < bufferSize; i++) {
  const white = Math.random() * 2 - 1;
  lastOut = (lastOut + 0.02 * white) / 1.02;
  data[i] = lastOut * 3.5; // scale to roughly [-1, 1]
}

const source = ctx.createBufferSource();
source.buffer = buffer;
source.loop = true;
source.connect(ctx.destination);
source.start();
```

The coefficient `0.02` controls the random-walk step size; `3.5` is the normalisation factor. These are empirically validated values from the react-native-audio-api guide, consistent with the standard Brownian noise algorithm used in Web Audio implementations.

---

## 3. In-App Purchase (Google Play Billing)

### Candidate assessment

| Library | Managed Expo (EAS Build) | One-time purchase | Backend required | Stability |
|---|---|---|---|---|
| `react-native-iap` | Requires Kotlin 2.2+; conflicts with expo-modules-core — extra Kotlin version config step required | Yes | No | Mature but fiddly with Expo |
| `expo-iap` | Yes via EAS Build + plugin | Yes | No | Maturing; archived original repo; active in OpenIAP monorepo |
| `react-native-purchases` (RevenueCat) | Yes via EAS Build | Yes (non-consumable) | No (RevenueCat backend) | Production-grade; RevenueCat manages receipt validation |

### Recommendation: `react-native-purchases` (RevenueCat)

**Rationale:**
- `react-native-iap` has a known Kotlin version conflict with `expo-modules-core` as of SDK 56, requiring manual Kotlin version pinning — an unnecessary source of build fragility for a solo developer.
- `expo-iap` works but is "still maturing" with reported Android acknowledgment bugs (purchase not finishing correctly), per maintainer's own admission.
- `react-native-purchases` wraps Google Play Billing behind RevenueCat's managed backend, which handles receipt validation, purchase state persistence, and entitlement management without requiring a custom server. This is the right choice for a solo developer who does not want to write backend validation logic.
- RevenueCat is the official recommendation on Expo's own documentation page as of 2026.
- RevenueCat's free tier covers apps under $2,500 MRR — appropriate for a first-revenue app.

**Weakness of this choice:** RevenueCat is a managed third-party service. If RevenueCat is down, purchase checks cannot be performed. For a simple "remove ads" one-time purchase, the Developer should also persist the entitlement locally (see below) so offline use always works.

### Installation

```bash
npx expo install react-native-purchases
```

No `app.json` plugin entry is required for Android-only apps. For iOS (not in scope for v1) a plugin entry would be needed.

### Initialisation (call once at app root, before any UI mounts)

```js
import Purchases from "react-native-purchases";

Purchases.configure({ apiKey: "goog_YOUR_REVENUECAT_GOOGLE_API_KEY" });
```

Place this in the root component (e.g. `app/_layout.tsx`) before the component tree renders. It is synchronous and does not block the UI.

### Querying product details

Define your product in Google Play Console as a **non-consumable in-app product** (not a subscription). Set a product ID, e.g. `remove_ads_v1`.

```js
const offerings = await Purchases.getOfferings();
const pkg = offerings.current?.availablePackages.find(
  (p) => p.product.identifier === "remove_ads_v1"
);
// pkg.product.priceString — localised display price
```

### Handling a purchase

```js
try {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  const hasEntitlement =
    customerInfo.entitlements.active["remove_ads"] !== undefined;
  if (hasEntitlement) {
    // persist locally and suppress ads
  }
} catch (e) {
  if (!e.userCancelled) {
    // show error to user
  }
}
```

Define an entitlement named `remove_ads` in the RevenueCat dashboard and attach your `remove_ads_v1` product to it.

### Persisting "ads removed" state

Do not rely solely on RevenueCat network calls for gating the ad component — a network call on every app launch adds latency and fails offline.

**Pattern:**

1. On successful purchase: write `ads_removed: "true"` to `expo-secure-store` (or `@react-native-async-storage/async-storage` — either works; SecureStore is slightly more tamper-resistant but overkill for ad suppression).
2. On app launch: read from local storage first (synchronous fast path), then verify with RevenueCat in the background and update if needed.

```js
// On launch — fast path
const localFlag = await SecureStore.getItemAsync("ads_removed");
setAdsRemoved(localFlag === "true");

// Background verification
const { customerInfo } = await Purchases.getCustomerInfo();
const active = customerInfo.entitlements.active["remove_ads"] !== undefined;
setAdsRemoved(active);
if (active) await SecureStore.setItemAsync("ads_removed", "true");
```

### Restore purchases

Google Play automatically restores non-consumable purchases on device reinstall, but the Developer should expose a "Restore Purchase" button in the UI:

```js
const { customerInfo } = await Purchases.restorePurchases();
```

### Is local persistence sufficient?

Yes, for a "remove ads" one-time purchase. The economic risk of a user spoofing local storage to suppress ads is effectively zero — the adversary gains a free app that is also free to download. Do not build server-side purchase validation for this use case.

---

## 4. AdMob Integration

### Library: `react-native-google-mobile-ads`

Confirmed to work in Expo managed workflow via EAS Build. Does NOT work in Expo Go (native code). Maintained by Invertase.

### app.json configuration

```json
{
  "expo": {
    "plugins": [
      [
        "react-native-google-mobile-ads",
        {
          "androidAppId": "ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX"
        }
      ]
    ]
  }
}
```

The `androidAppId` is the **App ID** (not the ad unit ID) from the AdMob dashboard — format `ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX`. For Android-only, omit `iosAppId`.

**Note:** The App ID must be real even during development; AdMob rejects apps that submit with the test App ID in the manifest. Use your real App ID in `app.json`, but use test ad unit IDs in JS code during development.

### eas.json

No AdMob-specific entries are required in `eas.json`. Standard EAS Build configuration applies.

### Initialisation

Call once at app root. It returns a Promise — do NOT `await` it in a way that blocks first render. Fire and forget, or await it in a `useEffect`:

```js
import mobileAds from "react-native-google-mobile-ads";

// In root component, useEffect with empty deps:
useEffect(() => {
  mobileAds().initialize(); // do not await; let it complete in background
}, []);
```

Ads may not load immediately while initialisation is pending, but this is acceptable — the spec requirement is that ads never block the UI, not that they load instantly.

### BannerAd component

```jsx
import { BannerAd, BannerAdSize, TestIds } from "react-native-google-mobile-ads";
import { useRef } from "react";
import { useForeground } from "react-native-google-mobile-ads";

const adUnitId = __DEV__
  ? TestIds.ADAPTIVE_BANNER
  : "ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY"; // real ad unit ID

function AdBanner() {
  const bannerRef = useRef(null);

  useForeground(() => {
    // reload ad when app comes to foreground — prevents stale ads
    bannerRef.current?.load();
  });

  return (
    <BannerAd
      ref={bannerRef}
      unitId={adUnitId}
      size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      onAdFailedToLoad={(error) => console.warn("AdMob failed:", error)}
    />
  );
}
```

**Size choice:** `ANCHORED_ADAPTIVE_BANNER` — fills the full width of the screen and auto-sizes height. This is the recommended modern format (replaces `SMART_BANNER`).

**Placement:** Fixed to the bottom of the screen. Use absolute positioning or a flex column with the banner outside the scrollable area, with `paddingBottom` on the main content equal to the banner height so nothing is obscured:

```jsx
// Screen layout
<View style={{ flex: 1 }}>
  <MainContent style={{ flex: 1 }} />
  {!adsRemoved && <AdBanner />}
</View>
```

The banner renders above the system navigation bar by default (Android handles insets). Test on a device with gesture navigation.

### Conditional suppression

The `AdBanner` component is conditionally rendered based on `adsRemoved` state (see section 5 for where this state lives). When `adsRemoved` is `true`, the component is not mounted — no network request, no placeholder, no space reserved.

### Test IDs vs production IDs

| Context | Ad Unit ID |
|---|---|
| Development (`__DEV__ === true`) | `TestIds.ADAPTIVE_BANNER` |
| Production | Real ad unit ID from AdMob dashboard |

Never use real ad unit IDs during development — it violates AdMob policy and risks account suspension.

---

## 5. App Architecture

### Screen structure

The app is a single screen (`app/index.tsx` in Expo Router, or `screens/HomeScreen.tsx` in stack navigation). No navigation stack is needed.

Sections from top to bottom:

```
┌────────────────────────────────┐
│  Frequency display + input     │  Large numeric display; tappable to open keyboard
│  Frequency quick-adjust        │  ± buttons or slider (v2 candidate)
├────────────────────────────────┤
│  Waveform selector             │  Sine / Square / Sawtooth / Triangle — segmented control or pill buttons
│  Noise selector                │  White / Pink / Brown — same pattern, or tabbed with waveforms
├────────────────────────────────┤
│  Play / Stop button            │  Large, prominent, centred
├────────────────────────────────┤
│  Support button                │  Small, low-prominence, "Support the dev — remove ads"
└────────────────────────────────┘
│  AdBanner (conditionally shown)│  Fixed bottom, full width
└────────────────────────────────┘
```

### State shape

All state lives in `useState` in the root screen component. No external state management library is needed for a single-screen app.

```ts
type AudioMode = "waveform" | "noise";

interface AppState {
  frequency: number;           // Hz, default: 440.0
  waveform: OscillatorType;    // "sine" | "square" | "sawtooth" | "triangle", default: "sine"
  noiseType: "white" | "pink" | "brown"; // default: "white"
  mode: AudioMode;             // whether currently playing a waveform or noise
  isPlaying: boolean;          // default: false
  adsRemoved: boolean;         // default: false; loaded async from storage on mount
  adsRemovedLoading: boolean;  // true during initial async storage read; prevents flash of ads
}
```

**Frequency input:** Store as `number`. The text input is controlled and displays `frequency.toString()`. Parse on blur/submit; reject non-numeric input; clamp to a sane range (e.g. 1–20000 Hz).

**Active audio node refs:** Store in `useRef`, not `useState` — changes to audio node refs should not trigger re-renders.

```ts
const audioContextRef = useRef<AudioContext | null>(null);
const oscillatorRef = useRef<OscillatorNode | null>(null);
const noiseSourceRef = useRef<AudioBufferSourceNode | null>(null);
const gainRef = useRef<GainNode | null>(null);
```

### Waveform type change while playing

Because `OscillatorNode` can only be started once, changing waveform type requires swapping nodes:

```ts
const changeWaveform = (newType: OscillatorType) => {
  setWaveform(newType);
  if (isPlaying && mode === "waveform" && audioContextRef.current) {
    // stop old
    oscillatorRef.current?.stop();
    oscillatorRef.current?.disconnect();
    // create new
    const osc = audioContextRef.current.createOscillator();
    osc.type = newType;
    osc.frequency.value = frequency;
    osc.connect(gainRef.current!);
    osc.start();
    oscillatorRef.current = osc;
  }
};
```

### Frequency change while playing

No node swap needed — set the `AudioParam` directly:

```ts
const changeFrequency = (hz: number) => {
  setFrequency(hz);
  if (oscillatorRef.current) {
    oscillatorRef.current.frequency.value = hz;
  }
};
```

### "Ads removed" status on launch

```ts
// In root screen component
useEffect(() => {
  const checkAdsRemoved = async () => {
    const local = await SecureStore.getItemAsync("ads_removed");
    if (local === "true") setAdsRemoved(true);
    setAdsRemovedLoading(false);

    // background verification
    try {
      const { customerInfo } = await Purchases.getCustomerInfo();
      const active = customerInfo.entitlements.active["remove_ads"] !== undefined;
      setAdsRemoved(active);
      if (active) await SecureStore.setItemAsync("ads_removed", "true");
    } catch {
      // network unavailable — local flag is source of truth
    }
  };
  checkAdsRemoved();
}, []);
```

While `adsRemovedLoading` is `true`, do not render the `AdBanner` — prevents a one-frame flash of an ad for users who have purchased.

### Required providers in root layout

```tsx
// app/_layout.tsx (Expo Router) or App.tsx (bare)
import { useEffect } from "react";
import mobileAds from "react-native-google-mobile-ads";
import Purchases from "react-native-purchases";

export default function RootLayout() {
  useEffect(() => {
    // AdMob init — fire and forget
    mobileAds().initialize();

    // RevenueCat init
    Purchases.configure({ apiKey: "goog_YOUR_KEY" });
  }, []);

  return <Stack />; // or your Navigator
}
```

No additional Context providers are required. `useState` at screen level is sufficient for all app state.

---

## 6. Dependencies List

Target: **Expo SDK 56** (React Native 0.85, Hermes v1, New Architecture enabled by default).

Install with `npx expo install` (not raw `npm install`) for each package — Expo will resolve the version compatible with SDK 56.

```bash
# Core
npx expo install react-native-audio-api      # audio engine — latest compatible with RN 0.85
npx expo install expo-secure-store           # "ads removed" persistence

# AdMob
npx expo install react-native-google-mobile-ads

# In-app purchase
npx expo install react-native-purchases

# Required for Expo managed workflow with native modules
npx expo install expo-dev-client             # enables EAS Dev Build
npx expo install expo-build-properties       # app.json build-time config (needed by AdMob plugin)
```

### Pinned/noted versions (as of May 2026)

| Package | Version | Notes |
|---|---|---|
| `expo` | `~56.0.0` | SDK 56 stable |
| `react-native` | `0.85.x` | Bundled with Expo SDK 56 |
| `react-native-audio-api` | `^0.12.2` | Latest as of May 2026; check for updates before release |
| `react-native-google-mobile-ads` | `latest compatible` | Pin after initial install, check Invertase changelog |
| `react-native-purchases` | `latest compatible` | RevenueCat — pin after initial install |
| `expo-secure-store` | `latest compatible with SDK 56` | Part of Expo ecosystem |
| `expo-dev-client` | `latest compatible with SDK 56` | Required for native modules in managed workflow |
| `expo-build-properties` | `latest compatible with SDK 56` | Required by AdMob config plugin |

### app.json plugins block (complete)

```json
{
  "expo": {
    "name": "Tone",
    "slug": "tone",
    "version": "1.0.0",
    "platforms": ["android"],
    "android": {
      "package": "com.yourhandle.tone",
      "adaptiveIcon": { ... }
    },
    "plugins": [
      [
        "react-native-audio-api",
        {
          "androidForegroundService": true,
          "androidPermissions": ["android.permission.FOREGROUND_SERVICE", "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"],
          "androidFSTypes": ["mediaPlayback"]
        }
      ],
      [
        "react-native-google-mobile-ads",
        {
          "androidAppId": "ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX"
        }
      ]
    ]
  }
}
```

No `react-native-purchases` plugin entry is required for Android-only apps.

---

## 7. Risks and Open Questions

### R1 — react-native-audio-api is pre-1.0

**Risk:** The library is at version 0.12.x. Pre-1.0 versions may have breaking API changes between minor releases. The library is actively maintained by a reputable company (Software Mansion), but there is no API stability guarantee until 1.0.  
**Mitigation:** Pin to `^0.12.2` at project creation. Review changelog before upgrading. The Web Audio API specification it implements is stable, so API changes are likely surface-level rather than architectural.

### R2 — OscillatorNode can only start once

**Risk:** Each waveform change while playing requires creating and destroying a node. If done too rapidly (e.g. user rapidly taps waveform buttons), there may be audio glitches during the swap.  
**Mitigation:** Debounce waveform selection changes by ~50 ms. The crossfade window (old node stopping, new node starting) can be smoothed with a GainNode ramped from 1→0 on the old and 0→1 on the new over 5–10 ms.

### R3 — Noise buffer loop click

**Risk:** A 2-second looping `AudioBufferSourceNode` may produce an audible click at the loop boundary if the buffer start and end samples do not match.  
**Mitigation:** Ensure the last sample of the buffer is close to 0, or apply a short fade-out/fade-in envelope at the buffer boundaries (5–10 ms). The react-native-audio-api noise guide does not address this explicitly — the Developer should test.

### R4 — expo-iap as an alternative

If `react-native-purchases` is rejected for any reason (policy, API change, RevenueCat account issues), the fallback is `expo-iap` from the OpenIAP monorepo. It is functional for Android non-consumable purchases but has known Android acknowledgment reliability issues as of May 2026. The API is documented at `hyochan.github.io/expo-iap/`. No ejecting is required.

### R5 — AdMob cold-start ad availability

**Risk:** AdMob does not guarantee an ad is ready immediately on first load. The banner may show blank for 1–5 seconds.  
**Mitigation:** This is expected and acceptable per the app's ad policy — ads must not block the core UI, but are not required to appear instantly. The `onAdFailedToLoad` callback should suppress the banner height (or show a zero-height placeholder) to avoid a blank white stripe.

### R6 — Android audio focus

**Risk:** When another app plays audio (navigation, call, media player), Android sends an audio focus loss event. The current spec does not address how the app responds.  
**Mitigation (recommended):** Listen for audio focus changes via `react-native-audio-api`'s AudioContext state (the context will suspend automatically on some Android versions). Add a listener that updates `isPlaying` state and shows a "Paused" indicator. Resuming should require explicit user action (tap Play again) — auto-resuming after a phone call ends would be disruptive.

### R7 — Expo SDK 56 and react-native-audio-api compatibility

The library ships `0.12.2` targeting React Native 0.85 (SDK 56). If there is any peer dependency mismatch, `npx expo install` will warn. The Developer should resolve all peer dependency warnings before the first EAS Build — do not suppress them.

### R8 — EAS Build requirement

All native modules in this stack (react-native-audio-api, react-native-google-mobile-ads, react-native-purchases) require an EAS Build (or local `expo prebuild` + Android Studio build). Expo Go will not work. The Developer needs an Expo account (free tier is sufficient) and must configure `eas.json` before first build.

### Not a risk: ejecting

None of the recommended libraries require ejecting from managed workflow. All use Expo config plugins that modify the native project at build time via EAS. The Developer never manually edits `android/` files.
