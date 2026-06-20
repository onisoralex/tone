import { AudioContext } from "react-native-audio-api";
import type { AudioBuffer } from "react-native-audio-api";

export type NoiseType = "white" | "pink" | "brown";

export const BUFFER_DURATION = 20; // seconds per buffer in the chain

export const generateNoise = (ctx: AudioContext, type: NoiseType): AudioBuffer => {
  const size = BUFFER_DURATION * ctx.sampleRate;
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (type === "white") {
    for (let i = 0; i < size; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  } else if (type === "pink") {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < size; i++) {
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
  } else {
    let lastOut = 0;
    for (let i = 0; i < size; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.02 * white) / 1.02;
      data[i] = lastOut * 3.5;
    }
  }

  return buffer;
};
