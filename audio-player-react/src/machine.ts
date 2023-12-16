import { Effect, Either, Match } from "effect";
import { createMachine } from "xstate";
import { loadAudio } from "./effect";
import type { MachineParams } from "./types";

interface Input {
  readonly audioRef: HTMLAudioElement;
}

interface Context {
  readonly currentTime: number;
  readonly audioRef: HTMLAudioElement;
}

type Events = MachineParams<{
  play: {};
  restart: {};
  end: {};
  pause: {};
  loading: {};
  loaded: {};
  error: { readonly message: unknown };
}>;

type Actions = MachineParams<{
  onPlay: {};
  onPause: {};
  onRestart: {};
  onLoad: {};
  onError: { readonly message: unknown };
}>;

export const machine = createMachine(
  {
    context: ({ input: { audioRef } }) => ({
      audioRef,
      currentTime: 0,
    }),
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
        entry: {
          type: "onLoad",
        },
        on: {
          loaded: {
            target: "Paused",
          },
          error: {
            target: "Error",
            actions: [
              ({ event }) =>
                Match.value(event).pipe(
                  Match.when({ type: "error" }, ({ params: { message } }) =>
                    Effect.sync(() =>
                      console.error(
                        `Error: ${JSON.stringify(message, null, 2)}`
                      )
                    ).pipe(Effect.runPromise)
                  )
                ),
            ],
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
      input: {} as Input,
      events: {} as Events,
      context: {} as Context,
      actions: {} as Actions,
    },
  },
  {
    actions: {
      onPlay: (_) => {},
      onPause: (_) => {},
      onRestart: (_) => {},
      onLoad: ({ context: { audioRef }, self }) =>
        loadAudio({ audioRef, context: null, trackSource: null }).pipe(
          Effect.either,
          Effect.map(
            Either.match({
              onLeft: (error) => {
                console.log({ error });

                return self.send({ type: "error", params: { message: error } });
              },
              onRight: (data) => self.send({ type: "loaded" }),
            })
          ),
          Effect.runPromise
        ),
    },
    actors: {},
    guards: {},
    delays: {},
  }
);
