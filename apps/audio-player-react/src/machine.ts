import { Effect } from "effect";
import { assign, setup } from "xstate";
import { onError, onLoad, onPause, onPlay, onRestart } from "./effect";
import { Context, Events } from "./machine-types";

export const machine = setup({
  types: {
    events: {} as Events,
    context: {} as Context,
  },
  actions: {
    onPlay: ({ context: { audioRef, audioContext } }) =>
      onPlay({ audioContext, audioRef }).pipe(Effect.runPromise),
    onPause: ({ context: { audioRef } }) =>
      onPause({ audioRef }).pipe(Effect.runSync),
    onRestart: ({ context: { audioRef } }) =>
      onRestart({ audioRef }).pipe(Effect.runPromise),
    onError: (_, { message }: { message: unknown }) =>
      onError({ message }).pipe(Effect.runPromise),
    onLoad: assign(({ self }, { audioRef }: { audioRef: HTMLAudioElement }) =>
      onLoad({ audioRef, context: null, trackSource: null }).pipe(
        Effect.tap(() => Effect.sync(() => self.send({ type: "loaded" }))),
        Effect.tapError(({ message }) =>
          Effect.sync(() => self.send({ type: "error", params: { message } }))
        ),
        Effect.map(({ context }) => context),
        Effect.catchTag("OnLoadError", ({ context }) =>
          Effect.succeed(context)
        ),
        Effect.runSync
      )
    ),
    onUpdateTime: assign((_, { updatedTime }: { updatedTime: number }) => ({
      currentTime: updatedTime,
    })),
  },
}).createMachine({
  context: {
    audioContext: null,
    trackSource: null,
    audioRef: null,
    currentTime: 0,
  },
  id: "Audio Player",
  initial: "Init",
  states: {
    Init: {
      on: {
        loading: {
          target: "Loading",
          actions: {
            type: "onLoad",
            params: ({ event }) => ({ audioRef: event.params.audioRef }),
          },
        },
        "init-error": {
          target: "Error",
          actions: {
            type: "onError",
            params: ({ event }) => ({ message: event.params.message }),
          },
        },
      },
    },
    Loading: {
      on: {
        loaded: {
          target: "Active",
        },
        error: {
          target: "Error",
          actions: {
            type: "onError",
            params: ({ event }) => ({ message: event.params.message }),
          },
        },
      },
    },
    Active: {
      initial: "Paused",
      states: {
        Paused: {
          entry: {
            type: "onPause",
          },
          on: {
            play: {
              target: "Playing",
            },
            restart: {
              target: "Playing",
              actions: {
                type: "onRestart",
              },
            },
          },
        },
        Playing: {
          entry: {
            type: "onPlay",
          },
          on: {
            restart: {
              target: "Playing",
              actions: {
                type: "onRestart",
              },
            },
            end: {
              target: "Paused",
            },
            pause: {
              target: "Paused",
            },
            time: {
              target: "Playing",
              actions: {
                type: "onUpdateTime",
                params: ({ event }) => ({
                  updatedTime: event.params.updatedTime,
                }),
              },
            },
          },
        },
      },
    },
    Error: {
      type: "final",
    },
  },
});
