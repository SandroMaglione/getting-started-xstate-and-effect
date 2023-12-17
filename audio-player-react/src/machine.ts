import { Console, Effect, Either, Match } from "effect";
import { assign, createMachine } from "xstate";
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
  loading: {
    readonly audioRef: HTMLAudioElement;
  };
  error: { readonly message: unknown };
  time: {};
}>;

type Actions = MachineParams<{
  onPlay: {};
  onPause: {};
  onRestart: {};
  onLoad: { readonly audioRef: HTMLAudioElement };
  onError: { readonly message: unknown };
  onUpdateTime: {};
}>;

export const machine = createMachine(
  {
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
          },
        },
      },
      Loading: {
        entry: assign(({ event, self }) =>
          Match.value(event)
            .pipe(
              Match.when({ type: "loading" }, ({ params: { audioRef } }) =>
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
                })
              ),
              Match.orElse(() =>
                Effect.sync(() =>
                  self.send({
                    type: "error",
                    params: { message: `Wrong entry event: ${event.type}` },
                  })
                ).pipe(Effect.map((): Partial<Context> => ({})))
              )
            )
            .pipe(Effect.runSync)
        ),
        on: {
          loaded: {
            target: "Active",
          },
          error: {
            target: "Error",
            actions: ({ event }) =>
              Match.value(event)
                .pipe(
                  Match.when({ type: "error" }, ({ params: { message } }) =>
                    Effect.sync(() =>
                      console.error(
                        `Error: ${JSON.stringify(message, null, 2)}`
                      )
                    )
                  ),
                  Match.orElse((event) =>
                    Effect.die(`Invalid event for "onError": ${event}`)
                  )
                )
                .pipe(Effect.runPromise),
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
    types: {
      events: {} as Events,
      context: {} as Context,
      actions: {} as Actions,
    },
  },
  {
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

          yield* _(
            Console.log(`Restarting audio from ${audioRef.currentTime}`)
          );

          return yield* _(
            Effect.sync(() => {
              audioRef.currentTime = 0; // Restart

              if (audioRef.paused) {
                audioRef.play();
              }
            })
          );
        }).pipe(Effect.runSync),
      onUpdateTime: assign(({ context }) =>
        Effect.sync(
          (): Partial<Context> => ({
            currentTime: context.audioRef?.currentTime ?? 0,
          })
        ).pipe(Effect.runSync)
      ),
    },
    actors: {},
    guards: {},
    delays: {},
  }
);
