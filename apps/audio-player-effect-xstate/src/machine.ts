import { fromAtom, fromEffect, fromStream } from "@typeonce/effect-xstate";
import { Effect, Stream } from "effect";
import { assign, setup } from "xstate";
import {
  MediaPlayer,
  type AudioInput,
  type LoudnessSample,
  type MediaPlayerState,
} from "./services/media-player";
import { mutedAtom, playbackRateAtom, volumeAtom } from "./settings";

type Context = MediaPlayerState;

type Events =
  | { readonly type: "play" }
  | { readonly type: "restart" }
  | { readonly type: "end" }
  | { readonly type: "pause" }
  | {
      readonly type: "loading";
      readonly params: { readonly audioRef: HTMLAudioElement };
    }
  | { readonly type: "initError"; readonly params: { readonly message: unknown } }
  | { readonly type: "time"; readonly params: { readonly updatedTime: number } };

export const machine = setup({
  types: {
    events: {} as Events,
    context: {} as Context,
  },
  actors: {
    loadAudio: fromEffect({
      effect: ({ input }: { readonly input: AudioInput }) =>
        Effect.gen(function* () {
          const mediaPlayer = yield* MediaPlayer;

          return yield* mediaPlayer.load(input);
        }),
    }),
    playAudio: fromEffect({
      effect: ({ input }: { readonly input: AudioInput }) =>
        Effect.gen(function* () {
          const mediaPlayer = yield* MediaPlayer;

          return yield* mediaPlayer.play(input);
        }),
    }),
    pauseAudio: fromEffect({
      effect: ({ input }: { readonly input: AudioInput }) =>
        Effect.gen(function* () {
          const mediaPlayer = yield* MediaPlayer;

          return yield* mediaPlayer.pause(input);
        }),
    }),
    restartAudio: fromEffect({
      effect: ({ input }: { readonly input: AudioInput }) =>
        Effect.gen(function* () {
          const mediaPlayer = yield* MediaPlayer;

          return yield* mediaPlayer.restart(input);
        }),
    }),
    analyzeAudio: fromStream({
      accumulation: { mode: "latest" },
      stream: ({ input }: { readonly input: AudioInput }) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const mediaPlayer = yield* MediaPlayer;

            return mediaPlayer.loudness({
              analyserNode: input.analyserNode,
            });
          })
        ),
    }),
    volumeSetting: fromAtom({
      atom: volumeAtom,
    }),
    mutedSetting: fromAtom({
      atom: mutedAtom,
    }),
    playbackRateSetting: fromAtom({
      atom: playbackRateAtom,
    }),
    reportError: fromEffect({
      effect: ({ input }: { readonly input: { readonly message: unknown } }) =>
        Effect.gen(function* () {
          const mediaPlayer = yield* MediaPlayer;

          return yield* mediaPlayer.reportError(input.message);
        }),
    }),
  },
  actions: {
    updateTime: assign((_, { updatedTime }: { updatedTime: number }) => ({
      currentTime: updatedTime,
    })),
    recordError: assign((_, { message }: { message: unknown }) => ({
      errorMessage: message,
    })),
    applyAudioSettings: ({ context }) => {
      if (context.audioRef === null) {
        return;
      }

      context.audioRef.volume = context.volume;
      context.audioRef.muted = context.muted;
      context.audioRef.playbackRate = context.playbackRate;
    },
    updateLoudness: assign(
      (_, { loudness }: { readonly loudness: LoudnessSample | null }) => ({
        loudness,
      })
    ),
  },
}).createMachine({
  context: {
    audioContext: null,
    trackSource: null,
    analyserNode: null,
    audioRef: null,
    currentTime: 0,
    errorMessage: null,
    volume: 1,
    muted: false,
    playbackRate: 1,
    loudness: null,
  },
  id: "Audio Player Effect XState",
  initial: "Init",
  invoke: [
    {
      src: "volumeSetting",
      onSnapshot: {
        actions: [
          assign(({ context, event }) => ({
            volume: event.snapshot.context ?? context.volume,
          })),
          "applyAudioSettings",
        ],
      },
    },
    {
      src: "mutedSetting",
      onSnapshot: {
        actions: [
          assign(({ context, event }) => ({
            muted: event.snapshot.context ?? context.muted,
          })),
          "applyAudioSettings",
        ],
      },
    },
    {
      src: "playbackRateSetting",
      onSnapshot: {
        actions: [
          assign(({ context, event }) => ({
            playbackRate: event.snapshot.context ?? context.playbackRate,
          })),
          "applyAudioSettings",
        ],
      },
    },
  ],
  states: {
    Init: {
      on: {
        loading: {
          target: "Loading",
          actions: assign(({ event }) => ({
            audioRef: event.params.audioRef,
            errorMessage: null,
          })),
        },
        initError: {
          target: "Error",
          actions: {
            type: "recordError",
            params: ({ event }) => ({ message: event.params.message }),
          },
        },
      },
    },
    Loading: {
      invoke: {
        src: "loadAudio",
        input: ({ context }) => ({
          audioRef: context.audioRef,
          audioContext: context.audioContext,
          trackSource: context.trackSource,
          analyserNode: context.analyserNode,
        }),
        onDone: {
          target: "Active",
          actions: [
            assign(({ event }) => event.output.context),
            "applyAudioSettings",
          ],
        },
        onError: {
          target: "Error",
          actions: {
            type: "recordError",
            params: ({ event }) => ({ message: event.error }),
          },
        },
      },
    },
    Active: {
      initial: "Paused",
      states: {
        Paused: {
          invoke: {
            src: "pauseAudio",
            input: ({ context }) => ({
              audioRef: context.audioRef,
              audioContext: context.audioContext,
              trackSource: context.trackSource,
              analyserNode: context.analyserNode,
            }),
            onError: {
              target: "#Audio Player Effect XState.Error",
              actions: {
                type: "recordError",
                params: ({ event }) => ({ message: event.error }),
              },
            },
          },
          on: {
            play: {
              target: "Playing",
            },
            restart: {
              target: "Restarting",
            },
          },
        },
        Playing: {
          invoke: [
            {
              src: "playAudio",
              input: ({ context }) => ({
                audioRef: context.audioRef,
                audioContext: context.audioContext,
                trackSource: context.trackSource,
                analyserNode: context.analyserNode,
              }),
              onError: {
                target: "#Audio Player Effect XState.Error",
                actions: {
                  type: "recordError",
                  params: ({ event }) => ({ message: event.error }),
                },
              },
            },
            {
              src: "analyzeAudio",
              input: ({ context }) => ({
                audioRef: context.audioRef,
                audioContext: context.audioContext,
                trackSource: context.trackSource,
                analyserNode: context.analyserNode,
              }),
              onSnapshot: {
                actions: {
                  type: "updateLoudness",
                  params: ({ event }) => ({
                    loudness: event.snapshot.latest ?? null,
                  }),
                },
              },
              onError: {
                target: "#Audio Player Effect XState.Error",
                actions: {
                  type: "recordError",
                  params: ({ event }) => ({ message: event.error }),
                },
              },
            },
          ],
          on: {
            restart: {
              target: "Restarting",
            },
            end: {
              target: "Paused",
            },
            pause: {
              target: "Paused",
            },
            time: {
              actions: {
                type: "updateTime",
                params: ({ event }) => ({
                  updatedTime: event.params.updatedTime,
                }),
              },
            },
          },
        },
        Restarting: {
          invoke: {
            src: "restartAudio",
            input: ({ context }) => ({
              audioRef: context.audioRef,
              audioContext: context.audioContext,
              trackSource: context.trackSource,
              analyserNode: context.analyserNode,
            }),
            onDone: {
              target: "Playing",
            },
            onError: {
              target: "#Audio Player Effect XState.Error",
              actions: {
                type: "recordError",
                params: ({ event }) => ({ message: event.error }),
              },
            },
          },
        },
      },
    },
    Error: {
      invoke: {
        src: "reportError",
        input: ({ context }) => ({ message: context.errorMessage }),
      },
    },
  },
});
