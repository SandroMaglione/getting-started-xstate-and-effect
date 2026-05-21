import { Atom, AtomRegistry } from "effect/unstable/reactivity";
import type {
  Actor,
  ActorRef,
  ActorOptions,
  AnyActorLogic,
  ConditionalRequired,
  EmittedFrom,
  EventFromLogic,
  InputFrom,
  IsNotNever,
  Observer,
  Readable,
  RequiredActorOptionsKeys,
  Snapshot,
  SnapshotFrom,
  Subscription,
} from "xstate";
import { createActor } from "xstate";
import {
  actorAtom,
  actorRefAtom,
  type ActorAtomRuntimeConfig,
  type ActorAtomOptions,
  type RuntimeActorAtom,
  type SnapshotWithRuntimeError,
} from "./atoms.ts";
import { registerActorSystemRuntimeContext } from "./runtime-context.ts";
import type { RuntimeConstraint } from "./types.ts";

export type RuntimeActorAtomConfig<
  TLogic extends AnyActorLogic,
  R = never,
> = {
  readonly logic: TLogic;
} & RuntimeConstraint<TLogic, R> &
  ConditionalRequired<
  {
    readonly options?: ActorAtomOptions<TLogic>;
  },
  IsNotNever<RequiredActorOptionsKeys<TLogic>>
>;

export type XStateRuntimeActorConfig<
  TLogic extends AnyActorLogic,
  R,
> = {
  readonly logic: TLogic;
} & RuntimeConstraint<TLogic, R> &
  ConditionalRequired<
    {
      readonly options?: ActorOptions<TLogic> & {
        readonly [K in RequiredActorOptionsKeys<TLogic>]: InputFrom<TLogic>;
      };
    },
    IsNotNever<RequiredActorOptionsKeys<TLogic>>
  >;

type RuntimeActorSnapshot<TLogic extends AnyActorLogic, ER> =
  SnapshotWithRuntimeError<SnapshotFrom<TLogic>, ER> & Snapshot<unknown>;

export type RuntimeActor<
  TLogic extends AnyActorLogic,
  ER,
> = Omit<
  Actor<TLogic>,
  "getSnapshot" | "ref" | "select" | "start" | "stop" | "subscribe"
> & {
  readonly ref: ActorRef<
    RuntimeActorSnapshot<TLogic, ER>,
    EventFromLogic<TLogic>,
    EmittedFrom<TLogic>
  >;
  readonly getSnapshot: () => RuntimeActorSnapshot<TLogic, ER>;
  readonly select: <TSelected>(
    selector: (snapshot: RuntimeActorSnapshot<TLogic, ER>) => TSelected,
    equalityFn?: ((a: TSelected, b: TSelected) => boolean) | undefined
  ) => Readable<TSelected>;
  readonly start: () => RuntimeActor<TLogic, ER>;
  readonly stop: () => RuntimeActor<TLogic, ER>;
  subscribe(
    observer: Observer<RuntimeActorSnapshot<TLogic, ER>>
  ): Subscription;
  subscribe(
    nextListener?: (snapshot: RuntimeActorSnapshot<TLogic, ER>) => void,
    errorListener?: ((error: unknown) => void) | undefined,
    completeListener?: (() => void) | undefined
  ): Subscription;
};

export interface XStateRuntime<R, ER> extends Atom.AtomRuntime<R, ER> {
  /**
   * Creates a standalone XState actor backed by this Atom runtime.
   *
   * Invoked `fromEffect` and `fromStream` actors can use services from the
   * Atom runtime, and error snapshots include failures from both the invoked
   * actor logic and the Atom runtime layer.
   *
   * @example
   * const runtime = xstateRuntime(Atom.runtime(Pricing.layer))
   * const actor = runtime.createActor({
   *   logic: fromEffect({
   *     effect: () => Pricing.use((pricing) => pricing.quote)
   *   })
   * })
   */
  readonly createActor: <TLogic extends AnyActorLogic>(
    config: XStateRuntimeActorConfig<TLogic, R>
  ) => RuntimeActor<TLogic, ER>;
  readonly actorAtom: <TLogic extends AnyActorLogic>(
    config: {
      readonly logic: TLogic;
    } & RuntimeConstraint<TLogic, R> &
      ConditionalRequired<
        {
          readonly options?: ActorAtomOptions<TLogic>;
        },
        IsNotNever<RequiredActorOptionsKeys<TLogic>>
      >
  ) => RuntimeActorAtom<TLogic, ER>;
  readonly actorRefAtom: <TLogic extends AnyActorLogic>(
    config: {
      readonly logic: TLogic;
    } & RuntimeConstraint<TLogic, R> &
      ConditionalRequired<
        {
          readonly options?: ActorAtomOptions<TLogic>;
        },
        IsNotNever<RequiredActorOptionsKeys<TLogic>>
      >
  ) => Atom.Atom<Actor<TLogic>>;
}

export const runtime = <R, ER>(
  atomRuntime: Atom.AtomRuntime<R, ER>
): XStateRuntime<R, ER> =>
  Object.assign(atomRuntime, {
    actorAtom: <TLogic extends AnyActorLogic>(
      config: {
        readonly logic: TLogic;
        readonly options?: ActorAtomOptions<TLogic>;
      }
    ) =>
      actorAtom({
        ...config,
        runtime: atomRuntime,
      } as ActorAtomRuntimeConfig<TLogic, R, ER>) as RuntimeActorAtom<TLogic, ER>,
    actorRefAtom: <TLogic extends AnyActorLogic>(
      config: {
        readonly logic: TLogic;
        readonly options?: ActorAtomOptions<TLogic>;
      }
    ) =>
      actorRefAtom({
        ...config,
        runtime: atomRuntime,
      } as ActorAtomRuntimeConfig<TLogic, R, ER>) as Atom.Atom<Actor<TLogic>>,
    createActor: <TLogic extends AnyActorLogic>(
      config: XStateRuntimeActorConfig<TLogic, R>
    ) => {
      const registry = AtomRegistry.make();
      const unmount = registry.mount(atomRuntime);
      const actor = createActor(config.logic, config.options);
      const unregister = registerActorSystemRuntimeContext(actor.system, {
        get: () => registry.get(atomRuntime) as any,
        subscribe: (onChange) => registry.subscribe(atomRuntime, onChange),
      });
      let closed = false;
      const close = () => {
        if (closed) {
          return;
        }
        closed = true;
        unregister();
        unmount();
      };
      actor.subscribe({
        complete: close,
        error: close,
      });
      const stop = actor.stop.bind(actor);
      actor.stop = () => {
        stop();
        close();
        return actor;
      };
      return actor as RuntimeActor<TLogic, ER>;
    },
  });
