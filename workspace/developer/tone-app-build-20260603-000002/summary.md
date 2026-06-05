# Tone App Build — Summary

**Task:** tone-app-build-20260603-000002  
**Status:** Complete — prebuild succeeded, android/ folder generated

---

## 1. What was implemented

- **app.json** — replaced with production config: package `app.hivefoundry.tone`, dark UI, Android-only, `react-native-audio-api` and `react-native-google-mobile-ads` plugins, EAS project metadata stub.
- **eas.json** — created with development (APK), preview (APK), and production (AAB) build profiles.
- **.env / .env.example** — placeholder environment variables for AdMob ad unit ID and RevenueCat API key.
- **.gitignore** — added `.env` entry (template only had `.env*.local`).
- **Dependencies installed** via `npx expo install`: react-native-audio-api, expo-secure-store, react-native-google-mobile-ads, react-native-purchases, expo-dev-client, expo-build-properties (auto-added to app.json plugins).
- **constants/Colors.ts** — all app colors as named constants.
- **constants/Layout.ts** — all spacing, font sizes, and dimension constants.
- **utils/audioBuffers.ts** — white, pink, and brown noise buffer generators with 10ms fade envelope at loop boundaries.
- **App.tsx** — full single-screen implementation: frequency input, waveform/noise selectors with pills, play/stop, RevenueCat IAP, AdMob banner, AppState background listener.
- **expo prebuild --platform android --clean** — ran successfully, android/ folder generated.

**AudioContext import confirmed:** `import { AudioContext } from "react-native-audio-api"` is correct. All factory methods (createOscillator, createGain, createBuffer, createBufferSource) and AudioParam automation methods (setTargetAtTime, setValueAtTime) are available.

---

## 2. Placeholder values to replace

| File | Key | What to put there |
|---|---|---|
| `app.json` | `plugins[react-native-google-mobile-ads].androidAppId` | AdMob App ID — format `ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX` |
| `.env` | `EXPO_PUBLIC_ADMOB_BANNER_ID` | AdMob banner ad unit ID — format `ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY` |
| `.env` | `REVENUECAT_GOOGLE_API_KEY` | RevenueCat Google API key — format `goog_...` |
| `app.json` | `extra.eas.projectId` | Fill after running `eas init` |
| RevenueCat dashboard | Entitlement | Create entitlement named `remove_ads`; attach product ID `remove_ads_v1` |
| Google Play Console | Product | Create non-consumable in-app product with ID `remove_ads_v1` |

---

## 3. First build commands

```bash
# 1. Replace placeholders in app.json and .env first

# 2. Prebuild (already done — only needed again if app.json plugins change)
cd projects/tone/app
npx expo prebuild --platform android --clean

# 3. Local debug build
cd android && ./gradlew assembleDebug

# 4. Install on device/emulator
adb install app/build/outputs/apk/debug/app-debug.apk

# 5. Start Metro
cd .. && npx expo start

# --- OR: EAS cloud build ---
eas build --profile development --platform android
```

---

## 4. Notes and assumptions

- **expo-build-properties** was auto-added to app.json plugins by `npx expo install` as a bare string entry.
- **iOS warning during prebuild** (`No 'iosAppId'`) — expected, safe to ignore; Android-only app.
- **expo-system-ui warning** — `userInterfaceStyle: dark` in app.json requires `expo-system-ui` to theme the status/navigation bars. Install with `npx expo install expo-system-ui` if needed.
- **android/ folder** is excluded from git via `.gitignore`. Re-generate with `npx expo prebuild --platform android --clean`.
- **REVENUECAT_GOOGLE_API_KEY** is not prefixed `EXPO_PUBLIC_` — available via `process.env` in the RN bundle. If it doesn't resolve, prefix it with `EXPO_PUBLIC_` and update the reference in App.tsx.
