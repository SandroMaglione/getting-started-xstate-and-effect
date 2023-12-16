import { Console, Effect, Either, Match } from "effect";
import { assign, createMachine } from "xstate";
import { loadAudio } from "./effect";
import type { MachineParams } from "./types";

interface Context {
  readonly currentTime: number;
  readonly audioRef: HTMLAudioElement | null;
}

type Events = MachineParams<{
  play: {};
  restart: {};
  end: {};
  pause: {};
  loaded: {};
  loading: { readonly audioRef: HTMLAudioElement };
  error: { readonly message: unknown };
}>;

type Actions = MachineParams<{
  onPlay: {};
  onPause: {};
  onRestart: {};
  onLoad: { readonly audioRef: HTMLAudioElement };
  onError: { readonly message: unknown };
}>;

export const machine = createMachine(
  {
    context: {
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
          Match.value(event).pipe(
            Match.when({ type: "loading" }, ({ params: { audioRef } }) =>
              loadAudio({ audioRef, context: null, trackSource: null }).pipe(
                Effect.either,
                Effect.map(
                  Either.match({
                    onLeft: (error) =>
                      self.send({
                        type: "error",
                        params: { message: error },
                      }),
                    onRight: (_) => self.send({ type: "loaded" }),
                  })
                ),
                Effect.map((): Partial<Context> => ({ audioRef })),
                Effect.runSync
              )
            ),
            Match.orElse(() =>
              Effect.sync(() =>
                self.send({
                  type: "error",
                  params: { message: `Wrong entry event: ${event.type}` },
                })
              ).pipe(
                Effect.map((): Partial<Context> => ({})),
                Effect.runSync
              )
            )
          )
        ),
        on: {
          loaded: {
            target: "Paused",
          },
          error: {
            target: "Error",
            actions: ({ event }) =>
              Match.value(event).pipe(
                Match.when({ type: "error" }, ({ params: { message } }) =>
                  Effect.sync(() =>
                    console.error(`Error: ${JSON.stringify(message, null, 2)}`)
                  ).pipe(Effect.runPromise)
                ),
                Match.exhaustive
              ),
          },
        },
      },
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
      Error: {
        type: "final",
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
        },
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
      onPlay: ({ context: { audioRef } }) =>
        Effect.gen(function* (_) {
          if (audioRef === null) {
            return yield* _(Effect.die("Missing audio ref" as const));
          }

          yield* _(Console.log("Playing audio"));

          return yield* _(Effect.promise(() => audioRef.play()));
        }).pipe(Effect.runPromise),
      onPause: (_) => {},
      onRestart: (_) => {},
    },
    actors: {},
    guards: {},
    delays: {},
  }
);
