import { Cause, Context, Effect, Exit, Fiber } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import type {
  ActorLogic,
  ActorScope,
  ActorSystem,
  ActorSystemInfo,
  AnyEventObject,
  EventObject,
  Snapshot,
} from "xstate";
import {
  getActorSystemRuntimeResult,
  subscribeActorSystemRuntime,
} from "./runtime-context.ts";
import type { EffectStopEvent, WithRuntimeRequirements } from "./types.ts";

export type { EffectStopEvent } from "./types.ts";

export type EffectSuccessEvent<A> = {
  readonly type: "effect.success";
  readonly value: A;
};

export type EffectFailureEvent<E> = {
  readonly type: "effect.failure";
  readonly cause: Cause.Cause<E>;
};

export type EffectActorEvent<A, E> = EffectStopEvent;

type EffectInternalEvent<A, E> =
  | EffectSuccessEvent<A>
  | EffectFailureEvent<E>
  | EffectStopEvent;

export type EffectActorSnapshot<A, E, TInput> =
  | {
      readonly status: "active";
      readonly output: undefined;
      readonly error: undefined;
      readonly input: TInput;
      readonly result: AsyncResult.AsyncResult<A, E>;
    }
  | {
      readonly status: "done";
      readonly output: A;
      readonly error: undefined;
      readonly input: undefined;
      readonly result: AsyncResult.AsyncResult<A, E>;
    }
  | {
      readonly status: "error";
      readonly output: undefined;
      readonly error: Cause.Cause<E>;
      readonly cause: Cause.Cause<E>;
      readonly input: undefined;
      readonly result: AsyncResult.AsyncResult<A, E>;
    }
  | {
      readonly status: "stopped";
      readonly output: undefined;
      readonly error: undefined;
      readonly input: undefined;
      readonly result: AsyncResult.AsyncResult<A, E>;
    };

export type FromEffectConfig<
  A,
  E,
  TInput,
  TEmitted extends EventObject,
  R,
> = {
  readonly effect: (scope: {
    readonly input: TInput;
    readonly emit: (event: TEmitted) => void;
  }) => Effect.Effect<A, E, R>;
};

const active = <A, E, TInput>(
  input: TInput
): EffectActorSnapshot<A, E, TInput> => ({
  status: "active",
  output: undefined,
  error: undefined,
  input,
  result: AsyncResult.initial(true),
});

const done = <A, E, TInput>(value: A): EffectActorSnapshot<A, E, TInput> => ({
  status: "done",
  output: value,
  error: undefined,
  input: undefined,
  result: AsyncResult.success(value),
});

const failed = <A, E, TInput>(
  cause: Cause.Cause<E>
): EffectActorSnapshot<A, E, TInput> => ({
  status: "error",
  output: undefined,
  error: cause,
  cause,
  input: undefined,
  result: AsyncResult.failure(cause),
});

const stopped = <A, E, TInput>(
  result: AsyncResult.AsyncResult<A, E>
): EffectActorSnapshot<A, E, TInput> => ({
  status: "stopped",
  output: undefined,
  error: undefined,
  input: undefined,
  result,
});

const settleResult = <A, E>(
  result: AsyncResult.AsyncResult<A, E>
): AsyncResult.AsyncResult<A, E> => {
  switch (result._tag) {
    case "Initial":
      return AsyncResult.initial(false);
    case "Success":
      return AsyncResult.success(result.value, {
        timestamp: result.timestamp,
      });
    case "Failure":
      return AsyncResult.failure(result.cause, {
        previousSuccess: result.previousSuccess,
      });
  }
};

const relayIfActive = <
  TSnapshot extends Snapshot<unknown>,
  TEvent extends EventObject,
  TEmitted extends EventObject,
>(
  actorScope: ActorScope<
    TSnapshot,
    TEvent,
    ActorSystem<ActorSystemInfo>,
    TEmitted
  >,
  event: AnyEventObject
): void => {
  if (actorScope.self.getSnapshot().status !== "active") {
    return;
  }
  (actorScope.self as unknown as { send: (event: AnyEventObject) => void }).send(
    event
  );
};

/**
 * Converts an Effect workflow into XState actor logic.
 *
 * Use this for invoked actors where XState should own the state-machine
 * lifecycle and input/output protocol, while Effect owns business logic,
 * failures, fibers, interruption, and optional emitted events.
 *
 * @since 0.1.0
 * @category conversions
 * @example
 * const pricing = fromEffect({
 *   effect: ({ input }) => Effect.succeed(input.quantity * 12)
 * })
 */
export const fromEffect = <
  A,
  E = never,
  TInput = void,
  TEmitted extends EventObject = EventObject,
  R = never,
>(
  config: FromEffectConfig<A, E, TInput, TEmitted, R>
): WithRuntimeRequirements<
  ActorLogic<
  EffectActorSnapshot<A, E, TInput>,
  EffectActorEvent<A, E>,
  TInput,
  ActorSystem<ActorSystemInfo>,
  TEmitted
  >,
  R,
  never
> => {
  const fibers = new WeakMap<object, Fiber.Fiber<unknown, unknown>>();
  const runtimeSubscriptions = new WeakMap<object, () => void>();
  const runtimeResolvedActors = new WeakSet<object>();
  const logic: ActorLogic<
    EffectActorSnapshot<A, E, TInput>,
    EffectActorEvent<A, E>,
    TInput,
    ActorSystem<ActorSystemInfo>,
    TEmitted
  > = {
    transition: (
      snapshot: EffectActorSnapshot<A, E, TInput>,
      event: EffectInternalEvent<A, E>,
      actorScope
    ) => {
      if (event.type === "effect.success") {
        if (snapshot.status !== "active") {
          return snapshot;
        }
        return done(event.value);
      }
      if (event.type === "effect.failure") {
        if (snapshot.status !== "active") {
          return snapshot;
        }
        return failed(event.cause);
      }
      if (event.type === "xstate.stop") {
        fibers.get(actorScope.self)?.interruptUnsafe();
        fibers.delete(actorScope.self);
        runtimeSubscriptions.get(actorScope.self)?.();
        runtimeSubscriptions.delete(actorScope.self);
        return stopped(settleResult(snapshot.result));
      }
      return snapshot;
    },
    getInitialSnapshot: (_actorScope, input) => active(input),
    start: (snapshot, actorScope) => {
      if (snapshot.status !== "active") {
        return;
      }
      const startFiber = (services: Context.Context<R>) => {
        if (
          runtimeResolvedActors.has(actorScope.self) ||
          actorScope.self.getSnapshot().status !== "active"
        ) {
          return;
        }
        runtimeResolvedActors.add(actorScope.self);
        runtimeSubscriptions.get(actorScope.self)?.();
        runtimeSubscriptions.delete(actorScope.self);
        const fiber = Effect.runForkWith(services)(
          Effect.suspend(() =>
            config.effect({
              input: snapshot.input,
              emit: actorScope.emit,
            })
          )
        );
        fibers.set(actorScope.self, fiber);
        fiber.addObserver((exit) => {
          fibers.delete(actorScope.self);
          if (Exit.isSuccess(exit)) {
            relayIfActive(actorScope, {
              type: "effect.success",
              value: exit.value,
            });
          } else {
            relayIfActive(actorScope, {
              type: "effect.failure",
              cause: exit.cause,
            });
          }
        });
      };
      const startWhenRuntimeReady = () => {
        if (
          runtimeResolvedActors.has(actorScope.self) ||
          actorScope.self.getSnapshot().status !== "active"
        ) {
          return;
        }
        const result = getActorSystemRuntimeResult(actorScope.system);
        if (result === undefined) {
          startFiber(Context.empty() as Context.Context<R>);
          return;
        }
        if (result._tag === "Success") {
          startFiber(result.value as Context.Context<R>);
          return;
        }
        if (result._tag === "Failure") {
          runtimeResolvedActors.add(actorScope.self);
          runtimeSubscriptions.get(actorScope.self)?.();
          runtimeSubscriptions.delete(actorScope.self);
          relayIfActive(actorScope, {
            type: "effect.failure",
            cause: result.cause,
          });
        }
      };
      startWhenRuntimeReady();
      if (getActorSystemRuntimeResult(actorScope.system)?._tag === "Initial") {
        const unsubscribe = subscribeActorSystemRuntime(actorScope.system, () => {
          startWhenRuntimeReady();
        });
        if (unsubscribe !== undefined) {
          runtimeSubscriptions.set(actorScope.self, unsubscribe);
          startWhenRuntimeReady();
        }
      }
    },
    getPersistedSnapshot: (snapshot) => snapshot,
  };
  return logic as WithRuntimeRequirements<typeof logic, R, never>;
};
