import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  AppStateStatus,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { BannerAd, BannerAdSize, TestIds } from "react-native-google-mobile-ads";
import Purchases from "react-native-purchases";
import * as SecureStore from "expo-secure-store";
import { Colors } from "./constants/Colors";
import { Layout } from "./constants/Layout";
import { generateNoise, BUFFER_DURATION } from "./utils/audioBuffers";
import type { NoiseType } from "./utils/audioBuffers";
import { AudioContext } from "react-native-audio-api";

type WaveformType = "sine" | "square" | "sawtooth" | "triangle";
type AudioMode = "waveform" | "noise";

const BANNER_ID = __DEV__
  ? TestIds.ADAPTIVE_BANNER
  : (process.env.EXPO_PUBLIC_ADMOB_BANNER_ID ?? TestIds.ADAPTIVE_BANNER);

const FADE_DURATION = 0.005; // 5ms gain ramp for waveform swaps

export default function App() {
  const [frequency, setFrequency] = useState(440);
  const [frequencyText, setFrequencyText] = useState("440");
  const [waveform, setWaveform] = useState<WaveformType>("sine");
  const [noiseType, setNoiseType] = useState<NoiseType>("white");
  const [mode, setMode] = useState<AudioMode>("waveform");
  const [isPlaying, setIsPlaying] = useState(false);
  const [adsRemoved, setAdsRemoved] = useState(false);
  const [adsRemovedLoading, setAdsRemovedLoading] = useState(true);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<any>(null);
  const noiseSourceRef = useRef<any>(null);
  const gainRef = useRef<any>(null);
  const noiseChainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noiseChainNoiseTypeRef = useRef<NoiseType>("white");

  // Check ads-removed status on mount, fast path from storage then background verify
  useEffect(() => {
    const checkAdsRemoved = async () => {
      try {
        const local = await SecureStore.getItemAsync("ads_removed");
        if (local === "true") setAdsRemoved(true);
      } catch {}
      setAdsRemovedLoading(false);

      try {
        const { customerInfo } = await Purchases.getCustomerInfo();
        const active = customerInfo.entitlements.active["remove_ads"] !== undefined;
        setAdsRemoved(active);
        if (active) await SecureStore.setItemAsync("ads_removed", "true");
      } catch {}
    };

    Purchases.configure({ apiKey: process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY ?? "" });
    checkAdsRemoved();
  }, []);

  // Stop playback when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") {
        if (isPlaying) stopPlayback();
      }
    });
    return () => sub.remove();
  }, [isPlaying]);

  const getOrCreateContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  };

  const stopPlayback = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    if (noiseChainTimerRef.current !== null) {
      clearTimeout(noiseChainTimerRef.current);
      noiseChainTimerRef.current = null;
    }
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
      } catch {}
      oscillatorRef.current = null;
    }
    if (noiseSourceRef.current) {
      try {
        noiseSourceRef.current.stop();
        noiseSourceRef.current.disconnect();
      } catch {}
      noiseSourceRef.current = null;
    }
    if (gainRef.current) {
      gainRef.current.disconnect();
      gainRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const startNoiseChain = useCallback((ctx: AudioContext, gain: any, type: NoiseType) => {
    noiseChainNoiseTypeRef.current = type;

    const schedule = (startTime: number) => {
      const buffer = generateNoise(ctx, noiseChainNoiseTypeRef.current);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.start(startTime);
      noiseSourceRef.current = source;

      const nextStart = startTime + BUFFER_DURATION;

      // 2ms gain dip at the buffer boundary — eliminates amplitude discontinuity click
      const XFADE = 0.002;
      gain.gain.setValueAtTime(1, nextStart - XFADE);
      gain.gain.linearRampToValueAtTime(0, nextStart);
      gain.gain.linearRampToValueAtTime(1, nextStart + XFADE);

      // Fire 3s before the next buffer is needed — plenty of time to generate it
      const msUntilGenerate = (nextStart - ctx.currentTime - 3) * 1000;
      noiseChainTimerRef.current = setTimeout(() => {
        schedule(nextStart);
      }, Math.max(100, msUntilGenerate));
    };

    schedule(ctx.currentTime);
  }, []);

  const startPlayback = useCallback(() => {
    const ctx = getOrCreateContext();
    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(ctx.destination);
    gainRef.current = gain;

    if (mode === "waveform") {
      const osc = ctx.createOscillator();
      osc.type = waveform;
      osc.frequency.value = frequency;
      osc.connect(gain);
      osc.start();
      oscillatorRef.current = osc;
    } else {
      startNoiseChain(ctx, gain, noiseType);
    }

    setIsPlaying(true);
  }, [mode, waveform, noiseType, frequency, startNoiseChain]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [isPlaying, stopPlayback, startPlayback]);

  const handleFrequencySubmit = useCallback(() => {
    const parsed = parseFloat(frequencyText);
    if (!isNaN(parsed)) {
      const clamped = Math.min(20000, Math.max(1, parsed));
      setFrequency(clamped);
      setFrequencyText(clamped.toString());
      // Update live if playing — no restart needed for frequency change
      if (oscillatorRef.current) {
        oscillatorRef.current.frequency.value = clamped;
      }
    } else {
      setFrequencyText(frequency.toString());
    }
  }, [frequencyText, frequency]);

  const selectWaveform = useCallback((w: WaveformType) => {
    const wasPlaying = isPlaying;
    const ctx = audioContextRef.current;

    if (wasPlaying && mode === "waveform" && ctx) {
      // Swap oscillator nodes with a short gain ramp to avoid click
      const oldGain = gainRef.current;
      if (oldGain) {
        oldGain.gain.setTargetAtTime(0, ctx.currentTime, FADE_DURATION);
      }

      setTimeout(() => {
        if (oscillatorRef.current) {
          try { oscillatorRef.current.stop(); oscillatorRef.current.disconnect(); } catch {}
          oscillatorRef.current = null;
        }
        if (gainRef.current) { gainRef.current.disconnect(); gainRef.current = null; }

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.setTargetAtTime(1, ctx.currentTime, FADE_DURATION);
        gain.connect(ctx.destination);
        gainRef.current = gain;

        const osc = ctx.createOscillator();
        osc.type = w;
        osc.frequency.value = frequency;
        osc.connect(gain);
        osc.start();
        oscillatorRef.current = osc;
      }, 20);
    } else if (wasPlaying && mode === "noise") {
      stopPlayback();
    }

    setWaveform(w);
    setMode("waveform");
  }, [isPlaying, mode, frequency, stopPlayback]);

  const selectNoise = useCallback((n: NoiseType) => {
    const wasPlaying = isPlaying;
    const ctx = audioContextRef.current;

    if (wasPlaying && mode === "noise" && ctx) {
      // Cancel the pending chain timer and any scheduled gain events, then restart
      if (noiseChainTimerRef.current !== null) {
        clearTimeout(noiseChainTimerRef.current);
        noiseChainTimerRef.current = null;
      }
      if (noiseSourceRef.current) {
        try { noiseSourceRef.current.stop(); noiseSourceRef.current.disconnect(); } catch {}
        noiseSourceRef.current = null;
      }
      const gain = gainRef.current!;
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(1, ctx.currentTime);
      startNoiseChain(ctx, gain, n);
    } else if (wasPlaying) {
      stopPlayback();
    }

    setNoiseType(n);
    setMode("noise");
  }, [isPlaying, mode, stopPlayback, startNoiseChain]);

  const handlePurchase = useCallback(async () => {
    setPurchaseError(null);
    try {
      const offerings = await Purchases.getOfferings();
      const pkg = offerings.current?.availablePackages.find(
        (p) => p.product.identifier === "remove_ads_v1"
      );
      if (!pkg) {
        setPurchaseError("Product not available. Try again later.");
        return;
      }
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (customerInfo.entitlements.active["remove_ads"] !== undefined) {
        await SecureStore.setItemAsync("ads_removed", "true");
        setAdsRemoved(true);
      }
    } catch (e: any) {
      if (!e.userCancelled) {
        setPurchaseError("Purchase failed. Please try again.");
      }
    }
  }, []);

  const handleRestorePurchase = useCallback(async () => {
    try {
      const { customerInfo } = await Purchases.restorePurchases();
      if (customerInfo.entitlements.active["remove_ads"] !== undefined) {
        await SecureStore.setItemAsync("ads_removed", "true");
        setAdsRemoved(true);
      }
    } catch {}
  }, []);

  const waveforms: WaveformType[] = ["sine", "square", "sawtooth", "triangle"];
  const noises: NoiseType[] = ["white", "pink", "brown"];

  return (
    <View style={styles.container}>
      <View style={styles.content}>

        {/* Frequency input */}
        <View style={styles.section}>
          <Text style={styles.label}>FREQUENCY</Text>
          <View style={styles.frequencyRow}>
            <TextInput
              style={styles.frequencyInput}
              value={frequencyText}
              onChangeText={setFrequencyText}
              onBlur={handleFrequencySubmit}
              onSubmitEditing={handleFrequencySubmit}
              keyboardType="decimal-pad"
              returnKeyType="done"
              selectTextOnFocus
            />
            <Text style={styles.frequencyUnit}>Hz</Text>
          </View>
        </View>

        {/* Waveform selector */}
        <View style={styles.section}>
          <Text style={styles.label}>WAVEFORM</Text>
          <View style={styles.pillRow}>
            {waveforms.map((w) => (
              <TouchableOpacity
                key={w}
                style={[styles.pill, mode === "waveform" && waveform === w && styles.pillActive]}
                onPress={() => selectWaveform(w)}
              >
                <Text style={[styles.pillText, mode === "waveform" && waveform === w && styles.pillTextActive]}>
                  {w.charAt(0).toUpperCase() + w.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Noise selector */}
        <View style={styles.section}>
          <Text style={styles.label}>NOISE</Text>
          <View style={styles.pillRow}>
            {noises.map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.pill, mode === "noise" && noiseType === n && styles.pillActive]}
                onPress={() => selectNoise(n)}
              >
                <Text style={[styles.pillText, mode === "noise" && noiseType === n && styles.pillTextActive]}>
                  {n.charAt(0).toUpperCase() + n.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Play / Stop */}
        <View style={styles.playSection}>
          <TouchableOpacity
            style={[styles.playButton, isPlaying && styles.playButtonActive]}
            onPress={togglePlayback}
            activeOpacity={0.8}
          >
            <Text style={styles.playButtonText}>{isPlaying ? "STOP" : "PLAY"}</Text>
          </TouchableOpacity>
        </View>

        {/* Support / remove ads */}
        {!adsRemoved && (
          <View style={styles.supportSection}>
            {purchaseError && <Text style={styles.errorText}>{purchaseError}</Text>}
            <TouchableOpacity onPress={handlePurchase}>
              <Text style={styles.supportText}>Remove ads — support the dev ♥</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleRestorePurchase}>
              <Text style={styles.restoreText}>Restore purchase</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* AdMob banner — only when not loading and ads not removed */}
      {!adsRemovedLoading && !adsRemoved && (
        <BannerAd
          unitId={BANNER_ID}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          onAdFailedToLoad={() => {/* render nothing on failure — height collapses automatically */}}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 60,
    paddingBottom: Layout.screenPadding,
    justifyContent: "space-between",
  },
  section: {
    gap: 10,
  },
  label: {
    fontSize: Layout.fontSizeLabel,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
  },
  frequencyRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  frequencyInput: {
    fontSize: Layout.fontSizeFrequency,
    fontWeight: "200",
    color: Colors.textPrimary,
    minWidth: 180,
  },
  frequencyUnit: {
    fontSize: 20,
    color: Colors.textSecondary,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    paddingHorizontal: Layout.pillPaddingH,
    paddingVertical: Layout.pillPaddingV,
    borderRadius: Layout.pillBorderRadius,
    borderWidth: 1,
    borderColor: Colors.pillBorder,
    backgroundColor: Colors.surface,
  },
  pillActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.surfaceActive,
  },
  pillText: {
    fontSize: Layout.fontSizeButton,
    color: Colors.textSecondary,
  },
  pillTextActive: {
    color: Colors.accent,
  },
  playSection: {
    alignItems: "center",
  },
  playButton: {
    width: Layout.playButtonSize * 1.5,
    height: Layout.playButtonSize,
    borderRadius: Layout.borderRadius,
    backgroundColor: Colors.play,
    alignItems: "center",
    justifyContent: "center",
  },
  playButtonActive: {
    backgroundColor: Colors.stop,
  },
  playButtonText: {
    fontSize: Layout.fontSizeButton,
    fontWeight: "700",
    color: Colors.background,
    letterSpacing: 2,
  },
  supportSection: {
    alignItems: "center",
    gap: 6,
  },
  supportText: {
    fontSize: Layout.fontSizeSupport,
    color: Colors.textSecondary,
  },
  restoreText: {
    fontSize: 11,
    color: Colors.pillBorder,
  },
  errorText: {
    fontSize: 12,
    color: Colors.stop,
  },
});
