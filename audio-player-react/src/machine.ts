import { createMachine } from "xstate";
import type { MachineParams, MachineType } from "./types";

interface Input {
  readonly audioRef: HTMLAudioElement;
}

interface Context {
  readonly currentTime: number;
  readonly audioRef: HTMLAudioElement;
}

type Events = MachineType<"play" | "restart" | "end" | "pause" | "loaded">;

type Actions = MachineParams<{
  onPlay: {};
  onPause: {};
  onRestart: {};
  onLoaded: {};
}>;

export const machine = createMachine(
  {
    context: ({ input: { audioRef } }) => ({
      audioRef,
      currentTime: 0,
    }),
    id: "Audio Player",
    initial: "Loading",
    states: {
      Loading: {
        on: {
          loaded: {
            target: "Paused",
            actions: {
              type: "onLoaded",
            },
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
      onLoaded: (_) => {},
    },
    actors: {},
    guards: {},
    delays: {},
  }
);
