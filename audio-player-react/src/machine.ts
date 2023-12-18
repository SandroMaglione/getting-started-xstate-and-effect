import { Console, Effect, Either } from "effect";
import { assign, setup } from "xstate";
import { loadAudio } from "./effect";
import type { MachineParams } from "./types";

interface Context {
  readonly currentTime: number;
  readonly audioRef: HTMLAudioElement | null;
  readonly audioContext: AudioContext | null;
  readonly trackSource: MediaElementAudioSourceNode | null;
}

type Events = MachineParams<{
  play: {};
  restart: {};
  end: {};
  pause: {};
  loaded: {};
  loading: { readonly audioRef: HTMLAudioElement };
  error: { readonly message: unknown };
  time: { readonly updatedTime: number };
}>;

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
      Effect.gen(function* (_) {
        const audioEither = yield* _(
          loadAudio({ audioRef, context: null, trackSource: null }),
          Effect.either
        );
        if (Either.isLeft(audioEither)) {
          yield* _(
            Effect.sync(() =>
              self.send({
                type: "error",
                params: { message: audioEither.left },
              })
            )
          );

          return { audioRef } satisfies Partial<Context>;
        }

        yield* _(Effect.sync(() => self.send({ type: "loaded" })));

        return {
          audioRef,
          audioContext: audioEither.right.audioContext,
          trackSource: audioEither.right.trackSource,
        } satisfies Partial<Context>;
      }).pipe(Effect.runSync)
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
