import { Console, Context, Data, Effect, Layer, Schedule, Stream } from "effect";

export interface MediaPlayerState {
  readonly currentTime: number;
  readonly audioRef: HTMLAudioElement | null;
  readonly audioContext: AudioContext | null;
  readonly trackSource: MediaElementAudioSourceNode | null;
  readonly analyserNode: AnalyserNode | null;
  readonly errorMessage: unknown;
  readonly volume: number;
  readonly muted: boolean;
  readonly playbackRate: number;
  readonly loudness: LoudnessSample | null;
}

export type AudioInput = Pick<
  MediaPlayerState,
  "audioRef" | "audioContext" | "trackSource" | "analyserNode"
>;

export type AudioSettingsInput = Pick<
  MediaPlayerState,
  "audioRef" | "volume" | "muted" | "playbackRate"
>;

export type AudioAnalysisInput = Pick<MediaPlayerState, "analyserNode">;

export interface LoudnessSample {
  readonly rms: number;
  readonly peak: number;
  readonly decibels: number;
}

export class OnLoadError extends Data.TaggedError("OnLoadError")<{
  context: Partial<MediaPlayerState>;
  message: string;
}> {}

export class OnAnalysisError extends Data.TaggedError("OnAnalysisError")<{
  message: string;
}> {}

export class OnLoadSuccess extends Data.TaggedClass("OnLoadSuccess")<{
  context: Partial<MediaPlayerState>;
}> {}

type BrowserWindow = Window & {
  readonly webkitAudioContext?: typeof AudioContext;
};

export class MediaPlayer extends Context.Service<MediaPlayer>()(
  "MediaPlayer",
  {
    make: Effect.succeed({
      load: (input: AudioInput) =>
        Effect.gen(function* () {
          if (input.audioRef === null) {
            return yield* Effect.die("Missing audio ref" as const);
          }

          const audioRef = input.audioRef;
          const AudioContextConstructor =
            window.AudioContext ||
            (window as BrowserWindow).webkitAudioContext;

          if (AudioContextConstructor === undefined) {
            return yield* Effect.fail(
              new OnLoadError({
                context: { audioRef },
                message: "AudioContext not supported",
              })
            );
          }

          const audioContext =
            input.audioContext ?? new AudioContextConstructor();
          const audioConfig = yield* Effect.try({
            try: () => {
              const trackSource =
                input.trackSource ??
                audioContext.createMediaElementSource(audioRef);
              const analyserNode =
                input.analyserNode ?? audioContext.createAnalyser();

              if (input.analyserNode === null) {
                analyserNode.fftSize = 256;
                trackSource.connect(analyserNode);
                analyserNode.connect(audioContext.destination);
              }

              return { analyserNode, trackSource, audioContext } as const;
            },
            catch: () =>
              new OnLoadError({
                context: { audioRef },
                message: "Error connecting audio graph",
              }),
          });

          return new OnLoadSuccess({
            context: {
              audioRef,
              audioContext: audioConfig.audioContext,
              trackSource: audioConfig.trackSource,
              analyserNode: audioConfig.analyserNode,
              errorMessage: null,
            },
          });
        }),
      applySettings: (input: AudioSettingsInput) =>
        Effect.sync(() => {
          if (input.audioRef === null) {
            return;
          }

          input.audioRef.volume = input.volume;
          input.audioRef.muted = input.muted;
          input.audioRef.playbackRate = input.playbackRate;
        }),
      loudness: (input: AudioAnalysisInput) => {
        if (input.analyserNode === null) {
          return Stream.fail(
            new OnAnalysisError({ message: "Missing analyser node" })
          );
        }

        const analyserNode = input.analyserNode;
        const data = new Uint8Array(analyserNode.fftSize);

        return Stream.fromEffectSchedule(
          Effect.sync(() => {
            analyserNode.getByteTimeDomainData(data);

            let sum = 0;
            let peak = 0;

            for (const value of data) {
              const normalized = (value - 128) / 128;
              const absolute = Math.abs(normalized);

              sum += normalized * normalized;
              peak = Math.max(peak, absolute);
            }

            const rms = Math.sqrt(sum / data.length);
            const decibels = 20 * Math.log10(Math.max(rms, 0.0001));

            return { rms, peak, decibels } satisfies LoudnessSample;
          }),
          Schedule.spaced("100 millis")
        );
      },
      play: (input: AudioInput) =>
        Effect.gen(function* () {
          if (input.audioRef === null) {
            return yield* Effect.die("Missing audio ref" as const);
          } else if (input.audioContext === null) {
            return yield* Effect.die("Missing audio context" as const);
          }

          const audioRef = input.audioRef;
          const audioContext = input.audioContext;

          yield* Console.log(`Playing audio: ${audioRef.src}`);

          if (audioContext.state === "suspended") {
            yield* Effect.promise(() => audioContext.resume());
          }

          return yield* Effect.promise(() => audioRef.play());
        }),
      pause: (input: AudioInput) =>
        Effect.gen(function* () {
          if (input.audioRef === null) {
            return yield* Effect.die("Missing audio ref" as const);
          }

          const audioRef = input.audioRef;

          yield* Console.log(`Pausing audio at ${audioRef.currentTime}`);

          return yield* Effect.sync(() => audioRef.pause());
        }),
      restart: (input: AudioInput) =>
        Effect.gen(function* () {
          if (input.audioRef === null) {
            return yield* Effect.die("Missing audio ref" as const);
          }

          const audioRef = input.audioRef;

          yield* Console.log(`Restarting audio from ${audioRef.currentTime}`);

          return yield* Effect.promise(async () => {
            audioRef.currentTime = 0;

            if (audioRef.paused) {
              await audioRef.play();
            }
          });
        }),
      reportError: (message: unknown) =>
        Effect.sync(() =>
          console.error(`Error: ${JSON.stringify(message, null, 2)}`)
        ),
    }),
  }
) {
  static readonly layer = Layer.effect(this)(this.make);
}
