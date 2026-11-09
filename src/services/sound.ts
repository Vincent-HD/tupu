import { Context, Effect, Layer, Ref, Schema } from "effect";

class SoundUnavailable extends Schema.TaggedError<
  SoundUnavailable,
  { readonly brand: unique symbol }
>()("SoundUnavailable", {
  cause: Schema.Defect(),
}) {}

export type Cue =
  | "tap"
  | "select"
  | "number"
  | "color"
  | "erase"
  | "undo"
  | "redo"
  | "error"
  | "hint"
  | "check-pass"
  | "check-fail"
  | "line"
  | "win"
  | "page";

export interface PlayInput {
  readonly cue: Cue;
  readonly value?: number | undefined;
}

interface Voice {
  readonly context: AudioContext;
  readonly output: GainNode;
  readonly noise: AudioBuffer;
}

const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];
const note = (index: number) => scale[index % scale.length] ?? 523.25;

const createVoice = (): Voice => {
  const context = new AudioContext();
  const output = context.createGain();
  const compressor = context.createDynamicsCompressor();
  output.connect(compressor).connect(context.destination);
  const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const channel = noise.getChannelData(0);
  for (let index = 0; index < channel.length; index++) channel[index] = Math.random() * 2 - 1;
  return { context, output, noise };
};

const envelope = (
  voice: Voice,
  input: { start: number; duration: number; peak: number; attack?: number | undefined },
) => {
  const gain = voice.context.createGain();
  const attack = input.attack ?? 0.004;
  gain.gain.setValueAtTime(0.0001, input.start);
  gain.gain.exponentialRampToValueAtTime(input.peak, input.start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, input.start + input.duration);
  gain.connect(voice.output);
  return gain;
};

const tone = (
  voice: Voice,
  input: {
    frequency: number;
    delay?: number;
    duration: number;
    peak: number;
    type?: OscillatorType;
    glideTo?: number;
  },
) => {
  const start = voice.context.currentTime + (input.delay ?? 0);
  const oscillator = voice.context.createOscillator();
  oscillator.type = input.type ?? "triangle";
  oscillator.frequency.setValueAtTime(input.frequency, start);
  if (input.glideTo)
    oscillator.frequency.exponentialRampToValueAtTime(input.glideTo, start + input.duration);
  oscillator.connect(envelope(voice, { start, duration: input.duration, peak: input.peak }));
  oscillator.start(start);
  oscillator.stop(start + input.duration + 0.05);
};

const rustle = (
  voice: Voice,
  input: {
    delay?: number;
    duration: number;
    peak: number;
    filter: BiquadFilterType;
    frequency: number;
    sweepTo?: number;
    q?: number;
    attack?: number | undefined;
  },
) => {
  const start = voice.context.currentTime + (input.delay ?? 0);
  const source = voice.context.createBufferSource();
  source.buffer = voice.noise;
  const filter = voice.context.createBiquadFilter();
  filter.type = input.filter;
  filter.frequency.setValueAtTime(input.frequency, start);
  if (input.sweepTo)
    filter.frequency.exponentialRampToValueAtTime(input.sweepTo, start + input.duration);
  filter.Q.value = input.q ?? 0.9;
  source
    .connect(filter)
    .connect(
      envelope(voice, { start, duration: input.duration, peak: input.peak, attack: input.attack }),
    );
  source.start(start, Math.random() * 0.5);
  source.stop(start + input.duration + 0.05);
};

const cues: Readonly<Record<Cue, (voice: Voice, value: number) => void>> = {
  tap: (voice) => {
    rustle(voice, { duration: 0.035, peak: 0.35, filter: "bandpass", frequency: 1800 });
    tone(voice, { frequency: 940, duration: 0.04, peak: 0.04 });
  },
  select: (voice) =>
    rustle(voice, { duration: 0.025, peak: 0.18, filter: "highpass", frequency: 3200 }),
  number: (voice, value) => {
    rustle(voice, { duration: 0.07, peak: 0.12, filter: "bandpass", frequency: 4200, q: 2 });
    tone(voice, { frequency: note(value), duration: 0.22, peak: 0.16 });
  },
  color: (voice, value) => {
    rustle(voice, {
      duration: 0.16,
      peak: 0.22,
      filter: "bandpass",
      frequency: 500,
      sweepTo: 2600,
      attack: 0.03,
    });
    tone(voice, { frequency: note(value) / 2, duration: 0.26, peak: 0.08, type: "sine" });
  },
  erase: (voice) => {
    rustle(voice, { duration: 0.08, peak: 0.2, filter: "lowpass", frequency: 1400 });
    rustle(voice, { delay: 0.07, duration: 0.08, peak: 0.16, filter: "lowpass", frequency: 1100 });
  },
  undo: (voice) =>
    tone(voice, { frequency: 700, glideTo: 380, duration: 0.11, peak: 0.1, type: "sine" }),
  redo: (voice) =>
    tone(voice, { frequency: 380, glideTo: 700, duration: 0.11, peak: 0.1, type: "sine" }),
  error: (voice) => {
    tone(voice, { frequency: 150, duration: 0.1, peak: 0.08, type: "square" });
    tone(voice, { frequency: 120, delay: 0.12, duration: 0.14, peak: 0.08, type: "square" });
  },
  hint: (voice) => {
    tone(voice, { frequency: 880, duration: 0.14, peak: 0.1, type: "sine" });
    tone(voice, { frequency: 1318.51, delay: 0.1, duration: 0.24, peak: 0.1, type: "sine" });
  },
  "check-pass": (voice) =>
    [523.25, 659.25, 783.99].forEach((frequency, index) =>
      tone(voice, { frequency, delay: index * 0.07, duration: 0.2, peak: 0.12 }),
    ),
  "check-fail": (voice) =>
    tone(voice, { frequency: 330, glideTo: 196, duration: 0.3, peak: 0.08, type: "sawtooth" }),
  line: (voice) => {
    tone(voice, { frequency: 1567.98, duration: 0.09, peak: 0.05, type: "sine" });
    tone(voice, { frequency: 2093, delay: 0.05, duration: 0.12, peak: 0.05, type: "sine" });
  },
  win: (voice) => {
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((frequency, index) =>
      tone(voice, { frequency, delay: index * 0.09, duration: 0.32, peak: 0.13 }),
    );
    [523.25, 659.25, 783.99].forEach((frequency) =>
      tone(voice, { frequency, delay: 0.5, duration: 0.9, peak: 0.07, type: "sine" }),
    );
    rustle(voice, {
      delay: 0.45,
      duration: 0.7,
      peak: 0.12,
      filter: "highpass",
      frequency: 2500,
      attack: 0.08,
    });
  },
  page: (voice) =>
    rustle(voice, {
      duration: 0.22,
      peak: 0.14,
      filter: "bandpass",
      frequency: 1400,
      sweepTo: 300,
      attack: 0.04,
    }),
};

export class Sound extends Context.Service<
  Sound,
  {
    readonly play: (input: PlayInput) => Effect.Effect<void>;
    readonly configure: (input: {
      readonly enabled: boolean;
      readonly volume: number;
    }) => Effect.Effect<void>;
  }
>()("tupu/services/Sound") {
  static readonly layer = Layer.effect(
    Sound,
    Effect.gen(function* () {
      const config = yield* Ref.make({ enabled: true, volume: 0.7 });
      const voice = yield* Ref.make<Voice | undefined>(undefined);

      const ensureVoice = Effect.gen(function* () {
        const existing = yield* Ref.get(voice);
        if (existing) return existing;
        const created = yield* Effect.try({
          try: createVoice,
          catch: (cause) => new SoundUnavailable({ cause }),
        });
        yield* Ref.set(voice, created);
        return created;
      });

      const play = Effect.fn("Sound.play")(
        function* (input: PlayInput) {
          const settings = yield* Ref.get(config);
          if (!settings.enabled || settings.volume <= 0) return;
          const active = yield* ensureVoice;
          if (active.context.state === "suspended")
            yield* Effect.promise(() => active.context.resume());
          active.output.gain.value = settings.volume * 0.9;
          cues[input.cue](active, input.value ?? 0);
        },
        (effect) => Effect.ignore(effect),
      );

      const configure = (input: { readonly enabled: boolean; readonly volume: number }) =>
        Ref.set(config, input);

      return Sound.of({ play, configure });
    }),
  );
}
