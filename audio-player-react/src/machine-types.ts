import { MachineParams } from "./types";

export interface Context {
  readonly currentTime: number;
  readonly audioRef: HTMLAudioElement | null;
  readonly audioContext: AudioContext | null;
  readonly trackSource: MediaElementAudioSourceNode | null;
}

export type Events = MachineParams<{
  play: {};
  restart: {};
  end: {};
  pause: {};
  loaded: {};
  loading: { readonly audioRef: HTMLAudioElement };
  error: { readonly message: unknown };
  time: { readonly updatedTime: number };
}>;
