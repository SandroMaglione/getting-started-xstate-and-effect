import { Cause, Option } from "effect";
import { Atom } from "effect/unstable/reactivity";
import {
  createActor,
  type Actor,
  type ActorOptions,
  type AnyActorLogic,
  type ConditionalRequired,
  type EmittedFrom,
  type EventFromLogic,
  type InputFrom,
  type IsNotNever,
  type RequiredActorOptionsKeys,
  type Snapshot,
  type SnapshotFrom,
} from "xstate";
import {
  registerActorSystemRegistry,
  withActorSystemRegistry,
} from "./from-atom.ts";
import { registerActorSystemRuntimeContext } from "./runtime-context.ts";
import type {
  NoRuntimeConstraint,
  RuntimeConstraint,
  RuntimeContextResult,
} from "./types.ts";

export type RuntimeAtom<R, ER> = Atom.Atom<RuntimeContextResult<R, ER>>;

export type ActorAtomOptions<TLogic extends AnyActorLogic> =
  ActorOptions<TLogic> & {
    readonly [K in RequiredActorOptionsKeys<TLogic>]: InputFrom<TLogic>;
  };

export type ActorAtomConfig<TLogic extends AnyActorLogic> = {
  readonly logic: TLogic;
} & NoRuntimeConstraint<TLogic> &
  ConditionalRequired<
    {
      readonly options?: ActorAtomOptions<TLogic>;
    },
    IsNotNever<RequiredActorOptionsKeys<TLogic>>
  >;

export type ActorAtomRuntimeConfig<
  TLogic extends AnyActorLogic,
  R,
  ER,
> = {
  readonly logic: TLogic;
  readonly runtime: RuntimeAtom<R, ER>;
} & RuntimeConstraint<TLogic, R> &
  ConditionalRequired<
    {
      readonly options?: ActorAtomOptions<TLogic>;
    },
    IsNotNever<RequiredActorOptionsKeys<TLogic>>
  >;

export interface ActorAtom<TLogic extends AnyActorLogic> extends Atom.Writable<
  SnapshotFrom<TLogic>,
  EventFromLogic<TLogic>
> {
  readonly actor: Atom.Atom<Actor<TLogic>>;
}

export type SnapshotWithRuntimeError<TSnapshot, ER> = TSnapshot extends {
  readonly status: "error";
  readonly error: Cause.Cause<infer E>;
  readonly cause: Cause.Cause<infer E2>;
}
  ? Omit<TSnapshot, "error" | "cause"> & {
      readonly error: Cause.Cause<E | E2 | ER>;
      readonly cause: Cause.Cause<E | E2 | ER>;
    }
  : TSnapshot;

export interface RuntimeActorAtom<
  TLogic extends AnyActorLogic,
  ER,
> extends Atom.Writable<
    SnapshotWithRuntimeError<SnapshotFrom<TLogic>, ER>,
    EventFromLogic<TLogic>
  > {
  readonly actor: Atom.Atom<Actor<TLogic>>;
}

export type EmittedSelection<
  TLogic extends AnyActorLogic,
  TType extends EmittedFrom<TLogic>["type"] | "*",
> = EmittedFrom<TLogic> &
  (TType extends "*" ? object : { readonly type: TType });

/**
 * Creates an Atom-owned XState actor reference.
 *
 * The actor is started lazily by the active Atom registry and stopped by the
 * Atom finalizer. Use this when the live `Actor` itself must be available to
 * other atoms, inspection tools, or lower-level integrations.
 *
 * @since 0.1.0
 * @category constructors
 * @example
 * const checkoutRef = actorRefAtom({ logic: checkoutMachine })
 */
export function actorRefAtom<TLogic extends AnyActorLogic>(
  config: ActorAtomConfig<TLogic>
): Atom.Atom<Actor<TLogic>>;
export function actorRefAtom<TLogic extends AnyActorLogic, R, ER>(
  config: ActorAtomRuntimeConfig<TLogic, R, ER>
): Atom.Atom<Actor<TLogic>>;
export function actorRefAtom<TLogic extends AnyActorLogic>(
  config: ActorAtomConfig<TLogic> | ActorAtomRuntimeConfig<TLogic, any, any>
): Atom.Atom<Actor<TLogic>> {
  return Atom.make((get) => {
    const actor = withActorSystemRegistry(get.registry, () =>
      createActor(config.logic, config.options)
    );
    const unregisterRegistry = registerActorSystemRegistry(
      actor.system,
      get.registry
    );
    let unregisterRuntime: (() => void) | undefined;
    if ("runtime" in config && config.runtime !== undefined) {
      unregisterRuntime = registerActorSystemRuntimeContext(actor.system, {
        get: () => get.registry.get(config.runtime!),
        subscribe: (onChange) =>
          get.registry.subscribe(config.runtime!, () => {
            onChange();
          }),
      });
    }
    const errorSubscription = actor.subscribe({ error: () => {} });
    actor.start();
    get.addFinalizer(() => {
      errorSubscription.unsubscribe();
      actor.stop();
      unregisterRuntime?.();
      unregisterRegistry();
    });
    return actor;
  });
}

/**
 * Wraps XState actor logic as a writable Effect Atom.
 *
 * Reading the atom returns the current XState snapshot. Writing to the atom
 * sends an event to the actor. This makes the machine a first-class node in the
 * Atom graph while XState still owns states, transitions, children, invokes,
 * and emitted events.
 *
 * @since 0.1.0
 * @category constructors
 * @example
 * const checkoutActor = actorAtom({ logic: checkoutMachine })
 */
export function actorAtom<TLogic extends AnyActorLogic>(
  config: ActorAtomConfig<TLogic>
): ActorAtom<TLogic>;
export function actorAtom<TLogic extends AnyActorLogic, R, ER>(
  config: ActorAtomRuntimeConfig<TLogic, R, ER>
): RuntimeActorAtom<TLogic, ER>;
export function actorAtom<TLogic extends AnyActorLogic>(
  config: ActorAtomConfig<TLogic> | ActorAtomRuntimeConfig<TLogic, any, any>
): ActorAtom<TLogic> | RuntimeActorAtom<TLogic, any> {
  const actor = actorRefAtom(config);
  const snapshot = Atom.writable<SnapshotFrom<TLogic>, EventFromLogic<TLogic>>(
    (get) => {
      const actorRef = get(actor);
      const subscription = actorRef.subscribe({
        next: (value) => {
          get.setSelf(value);
        },
        error: () => {
          get.setSelf(actorRef.getSnapshot());
        },
      });
      get.addFinalizer(() => {
        subscription.unsubscribe();
      });
      return actorRef.getSnapshot();
    },
    (ctx, event) => {
      ctx.get(actor).send(event);
    }
  );
  return Object.assign(snapshot, { actor });
}

/**
 * Creates an Atom projection over an `actorAtom` snapshot.
 *
 * Use this instead of selecting machine state inside React components when the
 * selected value is part of the application state graph. The selector is typed
 * from the XState logic and the atom updates only when the selected value
 * changes according to `equal`.
 *
 * @since 0.1.0
 * @category combinators
 * @example
 * const canSubmitAtom = selectAtom({
 *   actor: checkoutActor,
 *   selector: (snapshot) => snapshot.matches("ready")
 * })
 */
export const selectAtom = <TLogic extends AnyActorLogic, TSelected>(config: {
  readonly actor: ActorAtom<TLogic>;
  readonly selector: (snapshot: SnapshotFrom<TLogic>) => TSelected;
  readonly equal?: ((left: TSelected, right: TSelected) => boolean) | undefined;
}): Atom.Atom<TSelected> =>
  Atom.readable((get) => {
    const actorRef = get(config.actor.actor);
    let previous = config.selector(actorRef.getSnapshot());
    const equal = config.equal ?? Object.is;
    const subscription = actorRef.subscribe({
      next: (snapshot) => {
        const next = config.selector(snapshot);
        if (!equal(previous, next)) {
          previous = next;
          get.setSelf(next);
        }
      },
    });
    get.addFinalizer(() => {
      subscription.unsubscribe();
    });
    return previous;
  });

/**
 * Exposes XState emitted events as an Atom.
 *
 * This is useful for side channels that should not be modeled as durable
 * machine context, such as telemetry, completion notifications, or domain
 * events consumed elsewhere in the Atom graph.
 *
 * @since 0.1.0
 * @category combinators
 * @example
 * const completedAtom = emittedAtom({
 *   actor: checkoutActor,
 *   type: "checkout.completed"
 * })
 */
export const emittedAtom = <
  TLogic extends AnyActorLogic,
  TType extends EmittedFrom<TLogic>["type"] | "*",
>(config: {
  readonly actor: ActorAtom<TLogic>;
  readonly type: TType;
}): Atom.Atom<Option.Option<EmittedSelection<TLogic, TType>>> =>
  Atom.readable((get) => {
    const actorRef = get(config.actor.actor);
    const subscription = actorRef.on(config.type, (event) => {
      get.setSelf(Option.some(event));
    });
    get.addFinalizer(() => {
      subscription.unsubscribe();
    });
    return Option.none();
  });

/**
 * Exposes XState's persisted snapshot for an actor as an Atom.
 *
 * This delegates directly to `actor.getPersistedSnapshot()` and does not add
 * Effect-specific encoding, decoding, or restoration semantics.
 *
 * @since 0.1.0
 * @category combinators
 * @example
 * const snapshotAtom = persistedAtom({ actor: checkoutActor })
 */
export const persistedAtom = <TLogic extends AnyActorLogic>(config: {
  readonly actor: ActorAtom<TLogic>;
}): Atom.Atom<Snapshot<unknown>> =>
  Atom.readable((get) => {
    const actorRef = get(config.actor.actor);
    const update = () => {
      get.setSelf(actorRef.getPersistedSnapshot());
    };
    const subscription = actorRef.subscribe({
      next: update,
      error: update,
      complete: update,
    });
    get.addFinalizer(() => {
      subscription.unsubscribe();
    });
    return actorRef.getPersistedSnapshot();
  });
