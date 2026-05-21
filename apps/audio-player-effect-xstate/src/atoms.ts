import { runtime, selectAtom } from "@typeonce/effect-xstate";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";
import { machine } from "./machine";
import { MediaPlayer } from "./services/media-player";

export const registry = AtomRegistry.make();

export const appRuntime = runtime(Atom.runtime(MediaPlayer.layer));

export const audioPlayerActor = appRuntime.actorAtom({
  logic: machine,
});

export const stateAtom = selectAtom({
  actor: audioPlayerActor,
  selector: (snapshot) => snapshot.value,
});

export const currentTimeAtom = selectAtom({
  actor: audioPlayerActor,
  selector: (snapshot) => snapshot.context.currentTime,
});

export const loudnessAtom = selectAtom({
  actor: audioPlayerActor,
  selector: (snapshot) => snapshot.context.loudness,
});

export const canPlayAtom = selectAtom({
  actor: audioPlayerActor,
  selector: (snapshot) => snapshot.matches({ Active: "Paused" }),
});

export const canPauseAtom = selectAtom({
  actor: audioPlayerActor,
  selector: (snapshot) => snapshot.matches({ Active: "Playing" }),
});

export const canRestartAtom = selectAtom({
  actor: audioPlayerActor,
  selector: (snapshot) => snapshot.matches("Active"),
});
