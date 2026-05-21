import { Cause, Context, Effect, Exit, Fiber, Stream } from "effect";
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

export type StreamNextEvent<A> = {
  readonly type: "stream.next";
  readonly value: A;
};

export type StreamDoneEvent = {
  readonly type: "stream.done";
};

export type StreamFailureEvent<E> = {
  readonly type: "stream.failure";
  readonly cause: Cause.Cause<E>;
};

export type StreamActorEvent<A, E> = EffectStopEvent;

type StreamInternalEvent<A, E> =
  | StreamNextEvent<A>
  | StreamDoneEvent
  | StreamFailureEvent<E>
  | EffectStopEvent;

export type StreamActorSnapshot<A, E, TInput, TAccum = ReadonlyArray<A>> =
  | {
      readonly status: "active";
      readonly output: undefined;
      readonly error: undefined;
      readonly cause: undefined;
      readonly input: TInput;
      readonly value: TAccum;
      readonly latest: A | undefined;
      readonly count: number;
      readonly items: ReadonlyArray<A>;
      readonly result: AsyncResult.AsyncResult<A, E>;
    }
  | {
      readonly status: "done";
      readonly output: TAccum;
      readonly error: undefined;
      readonly cause: undefined;
      readonly input: undefined;
      readonly value: TAccum;
      readonly latest: A | undefined;
      readonly count: number;
      readonly items: ReadonlyArray<A>;
      readonly result: AsyncResult.AsyncResult<A, E>;
    }
  | {
      readonly status: "error";
      readonly output: undefined;
      readonly error: Cause.Cause<E>;
      readonly cause: Cause.Cause<E>;
      readonly input: undefined;
      readonly value: TAccum;
      readonly latest: A | undefined;
      readonly count: number;
      readonly items: ReadonlyArray<A>;
      readonly result: AsyncResult.AsyncResult<A, E>;
    }
  | {
      readonly status: "stopped";
      readonly output: undefined;
      readonly error: undefined;
      readonly cause: undefined;
      readonly input: undefined;
      readonly value: TAccum;
      readonly latest: A | undefined;
      readonly count: number;
      readonly items: ReadonlyArray<A>;
      readonly result: AsyncResult.AsyncResult<A, E>;
    };

export type StreamAccumulationPolicy<A, TAccum = ReadonlyArray<A>> =
  | {
      readonly mode?: "collect";
      readonly maxItems?: number | undefined;
    }
  | {
      readonly mode: "latest";
    }
  | {
      readonly mode: "none";
    }
  | {
      readonly mode: "reduce";
      readonly seed: TAccum;
      readonly reducer: (accumulator: TAccum, value: A) => TAccum;
    };

export type FromStreamConfig<
  A,
  E,
  TInput,
  TEmitted extends EventObject,
  R,
  TAccum,
> = {
  readonly stream: (scope: {
    readonly input: TInput;
    readonly emit: (event: TEmitted) => void;
  }) => Stream.Stream<A, E, R>;
  readonly accumulation?: StreamAccumulationPolicy<A, TAccum> | undefined;
};

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

const applyStreamPolicy = <A, TAccum>(
  policy: StreamAccumulationPolicy<A, TAccum> | undefined,
  items: ReadonlyArray<A>,
  accumulator: TAccum,
  value: A
): { readonly items: ReadonlyArray<A>; readonly value: TAccum } => {
  switch (policy?.mode) {
    case "latest":
      return { items: [value], value: [value] as TAccum };
    case "none":
      return { items: [], value: [] as TAccum };
    case "reduce":
      return {
        items,
        value: policy.reducer(accumulator, value),
      };
    case "collect":
    case undefined: {
      const next = [...items, value];
      const collected =
        policy?.maxItems === undefined
          ? next
          : next.slice(-Math.max(0, policy.maxItems));
      return { items: collected, value: collected as TAccum };
    }
  }
};

const streamActive = <A, E, TInput, TAccum>(
  input: TInput,
  accumulation: StreamAccumulationPolicy<A, TAccum> | undefined
): StreamActorSnapshot<A, E, TInput, TAccum> => ({
  status: "active",
  output: undefined,
  error: undefined,
  cause: undefined,
  input,
  value:
    accumulation?.mode === "none"
      ? ([] as TAccum)
      : accumulation?.mode === "reduce"
        ? accumulation.seed
        : ([] as TAccum),
  latest: undefined,
  count: 0,
  items: [],
  result: AsyncResult.initial(true),
});

/**
 * Converts an Effect Stream into XState actor logic.
 *
 * Use this when a machine invokes a streaming Effect workflow and needs each
 * emitted value reflected in the actor snapshot. Stopping the XState actor
 * interrupts the running Effect fiber.
 *
 * @since 0.1.0
 * @category conversions
 * @example
 * const prices = fromStream({
 *   stream: ({ input }) => Stream.fromIterable(input.values)
 * })
 */
export const fromStream = <
  A,
  E = never,
  TInput = void,
  TEmitted extends EventObject = EventObject,
  R = never,
  TAccum = ReadonlyArray<A>,
>(
  config: FromStreamConfig<A, E, TInput, TEmitted, R, TAccum>
): WithRuntimeRequirements<
  ActorLogic<
    StreamActorSnapshot<A, E, TInput, TAccum>,
    StreamActorEvent<A, E>,
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
    StreamActorSnapshot<A, E, TInput, TAccum>,
    StreamActorEvent<A, E>,
    TInput,
    ActorSystem<ActorSystemInfo>,
    TEmitted
  > = {
    transition: (
      snapshot: StreamActorSnapshot<A, E, TInput, TAccum>,
      event: StreamInternalEvent<A, E>,
      actorScope
    ) => {
      if (event.type === "stream.next") {
        if (snapshot.status !== "active") {
          return snapshot;
        }
        const next = applyStreamPolicy(
          config.accumulation,
          snapshot.items,
          snapshot.value,
          event.value
        );
        return {
          status: "active",
          output: undefined,
          error: undefined,
          cause: undefined,
          input: snapshot.input,
          value: next.value,
          latest: event.value,
          count: snapshot.count + 1,
          items: next.items,
          result: AsyncResult.success(event.value, { waiting: true }),
        };
      }
      if (event.type === "stream.done") {
        if (snapshot.status !== "active") {
          return snapshot;
        }
        return {
          status: "done",
          output: snapshot.value,
          error: undefined,
          cause: undefined,
          input: undefined,
          value: snapshot.value,
          latest: snapshot.latest,
          count: snapshot.count,
          items: snapshot.items,
          result: settleResult(snapshot.result),
        };
      }
      if (event.type === "stream.failure") {
        if (snapshot.status !== "active") {
          return snapshot;
        }
        return {
          status: "error",
          output: undefined,
          error: event.cause,
          cause: event.cause,
          input: undefined,
          value: snapshot.value,
          latest: snapshot.latest,
          count: snapshot.count,
          items: snapshot.items,
          result: AsyncResult.failure(event.cause),
        };
      }
      if (event.type === "xstate.stop") {
        fibers.get(actorScope.self)?.interruptUnsafe();
        fibers.delete(actorScope.self);
        runtimeSubscriptions.get(actorScope.self)?.();
        runtimeSubscriptions.delete(actorScope.self);
        return {
          status: "stopped",
          output: undefined,
          error: undefined,
          cause: undefined,
          input: undefined,
          value: snapshot.value,
          latest: snapshot.latest,
          count: snapshot.count,
          items: snapshot.items,
          result: settleResult(snapshot.result),
        };
      }
      return snapshot;
    },
    getInitialSnapshot: (_actorScope, input) =>
      streamActive(input, config.accumulation),
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
          Stream.suspend(() =>
            config.stream({
              input: snapshot.input,
              emit: actorScope.emit,
            })
          ).pipe(
            Stream.runForEach((value) =>
              Effect.sync(() => {
                relayIfActive(actorScope, {
                  type: "stream.next",
                  value,
                });
              })
            )
          )
        );
        fibers.set(actorScope.self, fiber);
        fiber.addObserver((exit) => {
          fibers.delete(actorScope.self);
          if (Exit.isSuccess(exit)) {
            relayIfActive(actorScope, {
              type: "stream.done",
            });
          } else {
            relayIfActive(actorScope, {
              type: "stream.failure",
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
            type: "stream.failure",
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
