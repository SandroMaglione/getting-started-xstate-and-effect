import { Atom } from "effect/unstable/reactivity";

export const volumeAtom = Atom.make(1);

export const mutedAtom = Atom.make(false);

export const playbackRateAtom = Atom.make(1);
