# @typeonce/effect-xstate

XState actor integrations for Effect Atom.

Use this package when XState should own state machines, actor snapshots,
invocations, emitted events, delays, and persistence, while Effect Atom owns the
component-facing reactive graph and actor lifecycle.

## Installation

```sh
pnpm add @typeonce/effect-xstate effect xstate
```

```sh
npm install @typeonce/effect-xstate effect xstate
```

```sh
yarn add @typeonce/effect-xstate effect xstate
```

`effect` and `xstate` are peer dependencies. If you use React components, install
the Effect React bindings used by your app as well, for example
`@effect/atom-react`.

## Import

```ts
import {
  actorAtom,
  actorRefAtom,
  emittedAtom,
  failureCause,
  failureValue,
  fromAtom,
  fromEffect,
  fromStream,
  isFailureSnapshot,
  persistedAtom,
  prettyCause,
  runtime,
  selectAtom,
} from "@typeonce/effect-xstate";
```

The package is ESM. The public package entrypoint is
`@typeonce/effect-xstate`. Published files also have subpath exports such as
`@typeonce/effect-xstate/from-effect`, but the root entrypoint is the intended
import path for application code.

## Exported APIs

### Atom-owned XState actors

- `actorAtom(config)` creates a writable Atom whose value is the current XState
  snapshot. Writing to the atom sends an event to the actor.
- `actorRefAtom(config)` creates an Atom containing the live XState `Actor`.
- `selectAtom(config)` derives an Atom from an `actorAtom` snapshot.
- `emittedAtom(config)` exposes emitted XState events as an Atom.
- `persistedAtom(config)` exposes `actor.getPersistedSnapshot()` as an Atom.

### Effect and Atom actor logic

- `fromAtom(config)` converts an Effect Atom into XState actor logic.
- `fromEffect(config)` converts an Effect workflow into XState actor logic.
- `fromStream(config)` converts an Effect Stream into XState actor logic.
- `runtime(atomRuntime)` wraps `Atom.runtime(layer)` with XState helpers so
  invoked `fromEffect` and `fromStream` actors can use services from the layer.

### Failure helpers

- `isFailureSnapshot(snapshot)` narrows XState error snapshots.
- `failureCause(snapshot)` returns the typed Effect `Cause`.
- `failureValue(snapshot)` extracts the first typed failure value, if present.
- `prettyCause(cause)` formats an Effect `Cause` for logging or diagnostics.

## Basic Usage

Create an XState machine, wrap it with `actorAtom`, and derive values from its
snapshot with `selectAtom`.

```ts
import { AtomRegistry } from "effect/unstable/reactivity";
import { assign, setup } from "xstate";
import { actorAtom, selectAtom } from "@typeonce/effect-xstate";

const checkoutMachine = setup({
  types: {
    context: {} as { readonly items: ReadonlyArray<string> },
    events: {} as
      | { readonly type: "checkout.add"; readonly item: string }
      | { readonly type: "checkout.submit" },
  },
}).createMachine({
  id: "checkout",
  initial: "editing",
  context: { items: [] },
  states: {
    editing: {
      on: {
        "checkout.add": {
          actions: assign({
            items: ({ context, event }) => [...context.items, event.item],
          }),
        },
        "checkout.submit": {
          target: "submitted",
          guard: ({ context }) => context.items.length > 0,
        },
      },
    },
    submitted: {},
  },
});

export const checkoutActor = actorAtom({
  logic: checkoutMachine,
});

export const canSubmitAtom = selectAtom({
  actor: checkoutActor,
  selector: (snapshot) =>
    snapshot.matches("editing") && snapshot.context.items.length > 0,
});

const registry = AtomRegistry.make();

registry.get(checkoutActor);
registry.set(checkoutActor, { type: "checkout.add", item: "book" });
registry.set(checkoutActor, { type: "checkout.submit" });
registry.get(canSubmitAtom);
```

Use `actorRefAtom` when another atom or integration needs the live XState actor
instead of only the current snapshot.

```ts
import { actorRefAtom } from "@typeonce/effect-xstate";

const checkoutRef = actorRefAtom({
  logic: checkoutMachine,
});
```

## Invoking Effect Workflows

Use `fromEffect` when a machine should invoke an Effect workflow as an actor.
The workflow receives XState input and an `emit` function.

```ts
import { Effect } from "effect";
import { assign, setup } from "xstate";
import { actorAtom, fromEffect } from "@typeonce/effect-xstate";

const quoteLogic = fromEffect({
  effect: ({ input }: { readonly input: { readonly total: number } }) =>
    Effect.succeed({ total: input.total, tax: input.total * 0.22 }),
});

const quoteMachine = setup({
  actors: { quoteLogic },
  types: {
    context: {} as { readonly total: number; readonly tax: number },
  },
}).createMachine({
  context: { total: 100, tax: 0 },
  invoke: {
    src: "quoteLogic",
    input: ({ context }) => ({ total: context.total }),
    onDone: {
      actions: assign({
        tax: ({ event }) => event.output.tax,
      }),
    },
  },
});

export const quoteActor = actorAtom({
  logic: quoteMachine,
});
```

If the Effect requires services from a layer, create an Atom runtime and use the
wrapped helpers.

```ts
import { Atom } from "effect/unstable/reactivity";
import { runtime as xstateRuntime } from "@typeonce/effect-xstate";

const appRuntime = xstateRuntime(Atom.runtime(AppLive));

export const appActor = appRuntime.actorAtom({
  logic: appMachine,
});

const standaloneActor = appRuntime.createActor({
  logic: appMachine,
});
```

## Invoking Streams

Use `fromStream` for long-running or multi-value Effect Streams. Stream snapshots
track `status`, `latest`, `count`, `items`, and `value`.

```ts
import { Stream } from "effect";
import { fromStream } from "@typeonce/effect-xstate";

const tickerLogic = fromStream({
  stream: () => Stream.fromIterable([1, 2, 3]),
  accumulation: { mode: "collect", maxItems: 100 },
});

const totalLogic = fromStream({
  stream: () => Stream.fromIterable([1, 2, 3]),
  accumulation: {
    mode: "reduce",
    seed: 0,
    reducer: (sum, value) => sum + value,
  },
});
```

Accumulation modes are:

- `collect`, the default, keeps emitted items and can cap them with `maxItems`.
- `latest` keeps only the latest item.
- `none` does not retain emitted items.
- `reduce` updates a custom accumulator.

## Invoking Atoms

Use `fromAtom` when a machine should invoke state that already lives in the
Effect Atom graph. Writable atoms accept `atom.set` events.

```ts
import { Atom } from "effect/unstable/reactivity";
import { createActor } from "xstate";
import { fromAtom } from "@typeonce/effect-xstate";

const count = Atom.make(0);
const countLogic = fromAtom({ atom: count });
const countActor = createActor(countLogic);

countActor.start();
countActor.send({ type: "atom.set", value: 1 });
countActor.getSnapshot().context;
```

When `fromAtom` is invoked inside an actor created by `actorAtom` or
`actorRefAtom`, it uses the active Atom registry automatically.

## Snapshot Side Channels

Use `emittedAtom` for XState emitted events that should be visible in the Atom
graph without storing them in machine context.

```ts
const completedAtom = emittedAtom({
  actor: checkoutActor,
  type: "checkout.completed",
});
```

Use `persistedAtom` when you need XState's persisted snapshot.

```ts
const persistedCheckoutAtom = persistedAtom({
  actor: checkoutActor,
});
```

## Handling Failures

`fromEffect`, `fromStream`, and `fromAtom` expose failures as Effect `Cause`
values on error snapshots.

```ts
import {
  failureCause,
  failureValue,
  isFailureSnapshot,
  prettyCause,
} from "@typeonce/effect-xstate";

const snapshot = actor.getSnapshot();

if (isFailureSnapshot(snapshot)) {
  console.error(prettyCause(failureCause(snapshot)));
  console.error(failureValue(snapshot));
}
```

## React Example

The React Vite example lives in `examples/react-vite`.

```sh
cd examples/react-vite
pnpm install
pnpm dev
```

It demonstrates `actorAtom`, `selectAtom`, `emittedAtom`, `persistedAtom`,
`fromAtom`, `fromEffect`, and `fromStream` with `@effect/atom-react`.
