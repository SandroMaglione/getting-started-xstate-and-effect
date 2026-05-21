# Agent Instructions

This library is an integration of `xstate` actors/machines using the `Atom` module of `effect`. The goal is to allow the use of `xstate` API for state management with `Atom` as a bridge inside components.

Current supported surface:

- `actorAtom` and `actorRefAtom` create Atom-owned XState actors and keep actor lifecycle tied to the active `AtomRegistry`.
- `fromAtom` invokes readable or writable Effect Atoms as XState actors, using the active actor Atom registry when available.
- `fromEffect` invokes Effect workflows as XState actors, including input, output, typed failures, interruption, and emitted events.
- `fromStream` invokes Effect Streams as XState actors, accumulating emitted items in the actor snapshot.
- `selectAtom`, `emittedAtom`, and `persistedAtom` expose XState snapshots, emitted events, and persisted snapshots as Atoms.
- `runtime(Atom.runtime(layer))` creates a local wrapper with `runtime.actorAtom` and `runtime.actorRefAtom`, so invoked `fromEffect` and `fromStream` actors can use services from the Atom runtime without global prototype mutation.
- Actor-system registry/runtime bridges are intentionally internal. Keep them scoped and avoid global mutation of Effect or XState objects.

This project keeps source references under `.repos/`.

- Check `.repos/effect` when working with Effect APIs, internals, examples, or type definitions.
- Check `.repos/xstate` when working with XState APIs, internals, examples, or type definitions.
- Treat those folders as upstream reference sources. Do not edit them unless the task explicitly asks to update the vendored subtree.

Run `pnpm run typecheck`, `pnpm run test-types` and `pnpm run test` to verify the work before completion.
