import { Console, Effect } from "effect";
import { assign, setup } from "xstate";
import { onLoad } from "./effect";
import { Context, Events } from "./machine-types";

export const machine = setup({
  types: {
    events: {} as Events,
    context: {} as Context,
  },
  actions: {
    onPlay: ({ context: { audioRef, audioContext } }) =>
      Effect.gen(function* (_) {
        if (audioRef === null) {
          return yield* _(Effect.die("Missing audio ref" as const));
        } else if (audioContext === null) {
          return yield* _(Effect.die("Missing audio context" as const));
        }

        yield* _(Console.log(`Playing audio: ${audioRef.src}`));

        if (audioContext.state === "suspended") {
          yield* _(Effect.promise(() => audioContext.resume()));
        }

        return yield* _(
          Effect.tryPromise({
            try: () => audioRef.play(),
            catch: (error) =>
              `Unable to play audio: ${JSON.stringify(error, null, 2)}`,
          })
        );
      }).pipe(
        Effect.tapError((error) => Console.log(error)),
        Effect.catchAll(() => Effect.sync(() => {})),
        Effect.runPromise
      ),
    onPause: ({ context: { audioRef } }) =>
      Effect.gen(function* (_) {
        if (audioRef === null) {
          return yield* _(Effect.die("Missing audio ref" as const));
        }

        yield* _(Console.log(`Pausing audio at ${audioRef.currentTime}`));

        return yield* _(Effect.sync(() => audioRef.pause()));
      }).pipe(Effect.runSync),
    onRestart: ({ context: { audioRef } }) =>
      Effect.gen(function* (_) {
        if (audioRef === null) {
          return yield* _(Effect.die("Missing audio ref" as const));
        }

        yield* _(Console.log(`Restarting audio from ${audioRef.currentTime}`));

        return yield* _(
          Effect.sync(() => {
            audioRef.currentTime = 0; // Restart

            if (audioRef.paused) {
              audioRef.play();
            }
          })
        );
      }).pipe(Effect.runSync),
    onError: (_, { message }: { message: unknown }) =>
      Effect.sync(() =>
        console.error(`Error: ${JSON.stringify(message, null, 2)}`)
      ).pipe(Effect.runPromise),
    onLoad: assign(({ self }, { audioRef }: { audioRef: HTMLAudioElement }) =>
      onLoad({ audioRef, context: null, trackSource: null }).pipe(
        Effect.flatMap(({ context }) =>
          Effect.sync(() => self.send({ type: "loaded" })).pipe(
            Effect.map(() => context)
          )
        ),
        Effect.catchTag("OnLoadError", ({ message, context }) =>
          Effect.sync(() =>
            self.send({ type: "error", params: { message } })
          ).pipe(Effect.map(() => context))
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
