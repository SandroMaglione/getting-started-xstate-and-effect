import { Cause, Context, Effect, Layer, Option, Stream } from "effect";
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity";
import { createActor, assign, emit, sendTo, setup } from "xstate";
import { describe, expect, it, vi } from "vitest";
import {
  actorAtom,
  emittedAtom,
  failureCause,
  failureValue,
  fromAtom,
  fromEffect,
  fromStream,
  isFailureSnapshot,
  prettyCause,
  persistedAtom,
  runtime as xstateRuntime,
  selectAtom,
} from "../src/main";
import { registerActorSystemRuntimeContext } from "../src/runtime-context";

const waitForStatus = async <S extends { readonly status: string }>(
  actor: { readonly getSnapshot: () => S },
  status: S["status"]
): Promise<S> => {
  await vi.waitFor(() => {
    expect(actor.getSnapshot().status).toBe(status);
  });
  return actor.getSnapshot();
};

describe("fromEffect", () => {
  class PricingService extends Context.Service<
    PricingService,
    { readonly unitPrice: number }
  >()("test/PricingService") {}

  it("runs an Effect actor with input, output, and emitted events", async () => {
    const logic = fromEffect({
      effect: (scope: {
        readonly input: { readonly quantity: number };
        readonly emit: (event: {
          readonly type: "quote.calculated";
          readonly total: number;
        }) => void;
      }) =>
        Effect.sync(() => {
          const total = scope.input.quantity * 12;
          scope.emit({ type: "quote.calculated", total });
          return total;
        }),
    });
    const actor = createActor(logic, { input: { quantity: 3 } });
    const emitted = vi.fn();

    actor.on("quote.calculated", emitted);
    actor.start();

    const snapshot = await waitForStatus(actor, "done");
    expect(snapshot.output).toBe(36);
    expect(snapshot.error).toBeUndefined();
    expect(emitted).toHaveBeenCalledWith({
      type: "quote.calculated",
      total: 36,
    });
    expect(actor.getPersistedSnapshot()).toEqual(snapshot);

    actor.stop();
  });

  it("turns Effect failures into error snapshots", async () => {
    const logic = fromEffect({
      effect: () => Effect.fail("pricing unavailable"),
    });
    const actor = createActor(logic);

    actor.subscribe({ error: () => {} });
    actor.start();

    const snapshot = await waitForStatus(actor, "error");
    expect(snapshot.output).toBeUndefined();
    expect(snapshot.error).toEqual(Cause.fail("pricing unavailable"));

    actor.stop();
  });

  it("captures synchronous defects thrown while constructing an Effect", async () => {
    const defect = new Error("boom");
    const logic = fromEffect({
      effect: () => {
        throw defect;
      },
    });
    const actor = createActor(logic);

    actor.subscribe({ error: () => {} });
    actor.start();

    const snapshot = await waitForStatus(actor, "error");
    if (snapshot.error === undefined) {
      throw new Error("Expected Effect defect cause");
    }
    expect(Cause.hasDies(snapshot.error)).toBe(true);
  });

  it("keeps a stopped actor stopped when interruption reports later", async () => {
    let interrupted = false;
    const logic = fromEffect({
      effect: () =>
        Effect.never.pipe(
          Effect.ensuring(
            Effect.sync(() => {
              interrupted = true;
            })
          )
        ),
    });
    const actor = createActor(logic);

    actor.start();
    actor.send({ type: "xstate.stop" });

    await vi.waitFor(() => {
      expect(interrupted).toBe(true);
    });
    expect(actor.getSnapshot().status).toBe("stopped");
    expect(actor.getSnapshot().result.waiting).toBe(false);

    await Effect.runPromise(Effect.yieldNow);
    expect(actor.getSnapshot().status).toBe("stopped");
  });

  it("ignores a late Effect success after an explicit stop", async () => {
    let resolve!: (value: number) => void;
    const value = new Promise<number>((resume) => {
      resolve = resume;
    });
    const logic = fromEffect({
      effect: () => Effect.promise(() => value),
    });
    const actor = createActor(logic);

    actor.start();
    actor.send({ type: "xstate.stop" });
    expect(actor.getSnapshot().status).toBe("stopped");

    resolve(123);
    await Effect.runPromise(Effect.yieldNow);

    expect(actor.getSnapshot()).toMatchObject({
      status: "stopped",
      output: undefined,
      error: undefined,
    });
  });

  it("interrupts the running fiber when XState stops the actor", async () => {
    let interrupted = false;
    const logic = fromEffect({
      effect: () =>
        Effect.never.pipe(
          Effect.ensuring(
            Effect.sync(() => {
              interrupted = true;
            })
          )
        ),
    });
    const actor = createActor(logic);

    actor.start();
    actor.stop();

    await vi.waitFor(() => {
      expect(interrupted).toBe(true);
    });
  });

  it("runs with a custom Atom runtime when used through actorAtom", async () => {
    const registry = AtomRegistry.make();
    const runtime = xstateRuntime(
      Atom.runtime(
        Layer.succeed(PricingService, PricingService.of({ unitPrice: 17 }))
      )
    );
    const machine = setup({
      types: {
        context: {} as { readonly total: number },
      },
      actors: {
        pricing: fromEffect({
          effect: (scope: { readonly input: { readonly quantity: number } }) =>
            Effect.gen(function* () {
              const service = yield* PricingService;
              return scope.input.quantity * service.unitPrice;
            }),
        }),
      },
    }).createMachine({
      context: { total: 0 },
      invoke: {
        src: "pricing",
        input: { quantity: 3 },
        onDone: {
          actions: assign({
            total: ({ event }) => event.output,
          }),
        },
      },
    });
    const machineAtom = runtime.actorAtom({ logic: machine });
    const unmount = registry.mount(machineAtom);

    await vi.waitFor(() => {
      expect(registry.get(machineAtom).context.total).toBe(51);
    });

    unmount();
  });

  it("waits for an Atom runtime to become available before starting", async () => {
    const registry = AtomRegistry.make();
    const runtimeAtom = Atom.make<
      AsyncResult.AsyncResult<Context.Context<PricingService>, never>
    >(AsyncResult.initial(true));
    const logic = fromEffect({
      effect: () =>
        Effect.gen(function* () {
          const service = yield* PricingService;
          return service.unitPrice;
        }),
    });
    const actor = actorAtom({ logic, runtime: runtimeAtom });
    const unmount = registry.mount(actor);

    expect(registry.get(actor).status).toBe("active");

    registry.set(
      runtimeAtom,
      AsyncResult.success(
        Context.make(PricingService, PricingService.of({ unitPrice: 22 }))
      )
    );

    await vi.waitFor(() => {
      expect(registry.get(actor).status).toBe("done");
    });
    expect(registry.get(actor).output).toBe(22);

    unmount();
  });

  it("turns Atom runtime failures into Effect actor error snapshots", async () => {
    const registry = AtomRegistry.make();
    const runtimeAtom = Atom.make<
      AsyncResult.AsyncResult<Context.Context<PricingService>, "runtime failed">
    >(
      AsyncResult.failure<Context.Context<PricingService>, "runtime failed">(
        Cause.fail("runtime failed" as const)
      )
    );
    const logic = fromEffect({
      effect: () =>
        Effect.gen(function* () {
          const service = yield* PricingService;
          return service.unitPrice;
        }),
    });
    const actor = actorAtom({ logic, runtime: runtimeAtom });
    const unmount = registry.mount(actor);

    await vi.waitFor(() => {
      expect(registry.get(actor).status).toBe("error");
    });
    const snapshot = registry.get(actor);
    if (snapshot.status !== "error") {
      throw new Error("Expected error snapshot");
    }
    expect(snapshot.cause).toEqual(Cause.fail("runtime failed"));

    unmount();
  });

  it("turns delayed Atom runtime failures into Effect actor error snapshots", async () => {
    const registry = AtomRegistry.make();
    const runtimeAtom = Atom.make<
      AsyncResult.AsyncResult<Context.Context<PricingService>, "runtime failed">
    >(AsyncResult.initial(true));
    const logic = fromEffect({
      effect: () =>
        Effect.gen(function* () {
          const service = yield* PricingService;
          return service.unitPrice;
        }),
    });
    const actor = actorAtom({ logic, runtime: runtimeAtom });
    const unmount = registry.mount(actor);

    expect(registry.get(actor).status).toBe("active");

    registry.set(
      runtimeAtom,
      AsyncResult.failure<Context.Context<PricingService>, "runtime failed">(
        Cause.fail("runtime failed" as const)
      )
    );

    await vi.waitFor(() => {
      expect(registry.get(actor).status).toBe("error");
    });
    const snapshot = registry.get(actor);
    if (snapshot.status !== "error") {
      throw new Error("Expected error snapshot");
    }
    expect(snapshot.cause).toEqual(Cause.fail("runtime failed"));

    unmount();
  });

  it("does not start an Effect actor after stop while runtime is initial", async () => {
    let runtimeResult: AsyncResult.AsyncResult<
      Context.Context<PricingService>,
      never
    > = AsyncResult.initial(true);
    const listeners = new Set<() => void>();
    const started = vi.fn();
    const logic = fromEffect({
      effect: () =>
        Effect.sync(() => {
          started();
          return 1;
        }),
    });
    const actor = createActor(logic);
    const unregister = registerActorSystemRuntimeContext(actor.system, {
      get: () => runtimeResult as any,
      subscribe: (onChange) => {
        listeners.add(onChange);
        return () => {
          listeners.delete(onChange);
        };
      },
    });

    actor.start();
    expect(actor.getSnapshot().status).toBe("active");
    actor.send({ type: "xstate.stop" });
    expect(actor.getSnapshot().status).toBe("stopped");

    runtimeResult = AsyncResult.success(
      Context.make(PricingService, PricingService.of({ unitPrice: 22 }))
    );
    listeners.forEach((listener) => listener());
    await Effect.runPromise(Effect.yieldNow);

    expect(started).not.toHaveBeenCalled();
    unregister();
    actor.stop();
  });

  it("creates standalone service-backed actors from an XState runtime", async () => {
    const runtime = xstateRuntime(
      Atom.runtime(
        Layer.succeed(PricingService, PricingService.of({ unitPrice: 31 }))
      )
    );
    const logic = fromEffect({
      effect: () =>
        Effect.gen(function* () {
          const service = yield* PricingService;
          return service.unitPrice;
        }),
    });
    const actor = runtime.createActor({ logic });

    actor.start();

    const snapshot = await waitForStatus(actor, "done");
    expect(snapshot.output).toBe(31);

    actor.stop();
  });

  it("turns standalone Atom runtime failures into actor error snapshots", async () => {
    const runtime = xstateRuntime(
      Atom.runtime(
        Layer.effectDiscard(Effect.fail("runtime failed" as const))
      )
    );
    const logic = fromEffect({
      effect: () => Effect.succeed(1),
    });
    const actor = runtime.createActor({ logic });

    actor.start();

    const snapshot = await waitForStatus(actor, "error");
    if (snapshot.status !== "error") {
      throw new Error("Expected error snapshot");
    }
    expect(snapshot.cause).toEqual(Cause.fail("runtime failed"));

    actor.stop();
  });

  it("cleans up standalone actors stopped before the Atom runtime is available", async () => {
    let runtimeFinalized = false;
    const started = vi.fn();
    const runtime = xstateRuntime(
      Atom.runtime(
        Layer.effect(
          PricingService,
          Effect.gen(function* () {
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                runtimeFinalized = true;
              })
            );
            return yield* Effect.never;
          })
        )
      )
    );
    const logic = fromEffect({
      effect: () =>
        Effect.sync(() => {
          started();
          return 1;
        }),
    });
    const actor = runtime.createActor({ logic });

    actor.start();
    expect(actor.getSnapshot().status).toBe("active");

    actor.stop();

    await vi.waitFor(() => {
      expect(runtimeFinalized).toBe(true);
    });
    expect(actor.getSnapshot().status).toBe("stopped");
    expect(started).not.toHaveBeenCalled();
  });
});

describe("fromStream", () => {
  class NumberSource extends Context.Service<
    NumberSource,
    { readonly values: ReadonlyArray<number> }
  >()("test/NumberSource") {}

  it("collects stream items and emits side-channel events", async () => {
    const logic = fromStream({
      stream: (scope: {
        readonly input: { readonly values: ReadonlyArray<number> };
        readonly emit: (event: {
          readonly type: "stream.item";
          readonly value: number;
        }) => void;
      }) =>
        Stream.fromIterable(scope.input.values).pipe(
          Stream.tap((value) =>
            Effect.sync(() => {
              scope.emit({ type: "stream.item", value });
            })
          )
        ),
    });
    const actor = createActor(logic, { input: { values: [1, 2, 3] } });
    const emitted = vi.fn();

    actor.on("stream.item", emitted);
    actor.start();

    const snapshot = await waitForStatus(actor, "done");
    expect(snapshot.items).toEqual([1, 2, 3]);
    expect(snapshot.output).toEqual([1, 2, 3]);
    expect(snapshot.result.waiting).toBe(false);
    expect(emitted).toHaveBeenCalledTimes(3);
    expect(emitted).toHaveBeenLastCalledWith({ type: "stream.item", value: 3 });

    actor.stop();
  });

  it("captures synchronous defects thrown while constructing a Stream", async () => {
    const logic = fromStream({
      stream: () => {
        throw new Error("stream boom");
      },
    });
    const actor = createActor(logic);

    actor.subscribe({ error: () => {} });
    actor.start();

    const snapshot = await waitForStatus(actor, "error");
    if (snapshot.error === undefined) {
      throw new Error("Expected Stream defect cause");
    }
    expect(Cause.hasDies(snapshot.error)).toBe(true);
  });

  it("preserves collected items when a stream fails", async () => {
    const logic = fromStream({
      stream: () =>
        Stream.fromIterable([1, 2]).pipe(Stream.concat(Stream.fail("boom"))),
    });
    const actor = createActor(logic);

    actor.subscribe({ error: () => {} });
    actor.start();

    const snapshot = await waitForStatus(actor, "error");
    expect(snapshot.items).toEqual([1, 2]);
    expect(snapshot.output).toBeUndefined();
    expect(snapshot.error).toEqual(Cause.fail("boom"));

    actor.stop();
  });

  it("supports bounded stream collection", async () => {
    const logic = fromStream({
      stream: () => Stream.fromIterable([1, 2, 3]),
      accumulation: { mode: "collect", maxItems: 2 },
    });
    const actor = createActor(logic);

    actor.start();

    const snapshot = await waitForStatus(actor, "done");
    expect(snapshot.items).toEqual([2, 3]);
    expect(snapshot.value).toEqual([2, 3]);
    expect(snapshot.output).toEqual([2, 3]);
    expect(snapshot.latest).toBe(3);
    expect(snapshot.count).toBe(3);

    actor.stop();
  });

  it("supports latest-only stream snapshots", async () => {
    const logic = fromStream({
      stream: () => Stream.fromIterable([1, 2, 3]),
      accumulation: { mode: "latest" },
    });
    const actor = createActor(logic);

    actor.start();

    const snapshot = await waitForStatus(actor, "done");
    expect(snapshot.items).toEqual([3]);
    expect(snapshot.value).toEqual([3]);
    expect(snapshot.output).toEqual([3]);
    expect(snapshot.latest).toBe(3);
    expect(snapshot.count).toBe(3);

    actor.stop();
  });

  it("supports emit-only stream snapshots", async () => {
    const logic = fromStream({
      stream: () => Stream.fromIterable([1, 2, 3]),
      accumulation: { mode: "none" },
    });
    const actor = createActor(logic);

    actor.start();

    const snapshot = await waitForStatus(actor, "done");
    expect(snapshot.items).toEqual([]);
    expect(snapshot.value).toEqual([]);
    expect(snapshot.output).toEqual([]);
    expect(snapshot.latest).toBe(3);
    expect(snapshot.count).toBe(3);

    actor.stop();
  });

  it("supports reduced stream snapshots", async () => {
    const logic = fromStream({
      stream: () => Stream.fromIterable([1, 2, 3]),
      accumulation: {
        mode: "reduce",
        seed: 0,
        reducer: (sum, value) => sum + value,
      },
    });
    const actor = createActor(logic);

    actor.start();

    const snapshot = await waitForStatus(actor, "done");
    expect(snapshot.items).toEqual([]);
    expect(snapshot.value).toBe(6);
    expect(snapshot.output).toBe(6);
    expect(snapshot.latest).toBe(3);
    expect(snapshot.count).toBe(3);

    actor.stop();
  });

  it("ignores pending stream values after stop", async () => {
    let resolveNext!: (value: number) => void;
    const next = new Promise<number>((resume) => {
      resolveNext = resume;
    });
    const logic = fromStream({
      stream: () =>
        Stream.fromIterable([1]).pipe(
          Stream.concat(Stream.fromEffect(Effect.promise(() => next)))
        ),
    });
    const actor = createActor(logic);

    actor.start();
    await vi.waitFor(() => {
      expect(actor.getSnapshot().items).toEqual([1]);
    });

    actor.send({ type: "xstate.stop" });
    resolveNext(2);
    await Effect.runPromise(Effect.yieldNow);

    expect(actor.getSnapshot()).toMatchObject({
      status: "stopped",
      items: [1],
      output: undefined,
      error: undefined,
    });
    expect(actor.getSnapshot().result.waiting).toBe(false);
  });

  it("runs with a custom Atom runtime when used through actorAtom", async () => {
    const registry = AtomRegistry.make();
    const runtime = xstateRuntime(
      Atom.runtime(
        Layer.succeed(NumberSource, NumberSource.of({ values: [4, 5, 6] }))
      )
    );
    const machine = setup({
      types: {
        context: {} as { readonly values: ReadonlyArray<number> },
      },
      actors: {
        numbers: fromStream({
          stream: () =>
            Stream.unwrap(
              Effect.gen(function* () {
                const source = yield* NumberSource;
                return Stream.fromIterable(source.values);
              })
            ),
        }),
      },
    }).createMachine({
      context: { values: [] },
      invoke: {
        src: "numbers",
        onDone: {
          actions: assign({
            values: ({ event }) => event.output,
          }),
        },
      },
    });
    const machineAtom = runtime.actorAtom({ logic: machine });
    const unmount = registry.mount(machineAtom);

    await vi.waitFor(() => {
      expect(registry.get(machineAtom).context.values).toEqual([4, 5, 6]);
    });

    unmount();
  });

  it("turns delayed Atom runtime failures into Stream actor error snapshots", async () => {
    const registry = AtomRegistry.make();
    const runtimeAtom = Atom.make<
      AsyncResult.AsyncResult<Context.Context<NumberSource>, "runtime failed">
    >(AsyncResult.initial(true));
    const logic = fromStream({
      stream: () =>
        Stream.unwrap(
          Effect.gen(function* () {
            const source = yield* NumberSource;
            return Stream.fromIterable(source.values);
          })
        ),
    });
    const actor = actorAtom({ logic, runtime: runtimeAtom });
    const unmount = registry.mount(actor);

    expect(registry.get(actor).status).toBe("active");

    registry.set(
      runtimeAtom,
      AsyncResult.failure<Context.Context<NumberSource>, "runtime failed">(
        Cause.fail("runtime failed" as const)
      )
    );

    await vi.waitFor(() => {
      expect(registry.get(actor).status).toBe("error");
    });
    const snapshot = registry.get(actor);
    if (snapshot.status !== "error") {
      throw new Error("Expected error snapshot");
    }
    expect(snapshot.cause).toEqual(Cause.fail("runtime failed"));

    unmount();
  });

  it("does not start a Stream actor after stop while runtime is initial", async () => {
    let runtimeResult: AsyncResult.AsyncResult<
      Context.Context<NumberSource>,
      never
    > = AsyncResult.initial(true);
    const listeners = new Set<() => void>();
    const started = vi.fn();
    const logic = fromStream({
      stream: () =>
        Stream.sync(() => {
          started();
          return 1;
        }),
    });
    const actor = createActor(logic);
    const unregister = registerActorSystemRuntimeContext(actor.system, {
      get: () => runtimeResult as any,
      subscribe: (onChange) => {
        listeners.add(onChange);
        return () => {
          listeners.delete(onChange);
        };
      },
    });

    actor.start();
    expect(actor.getSnapshot().status).toBe("active");
    actor.send({ type: "xstate.stop" });
    expect(actor.getSnapshot().status).toBe("stopped");

    runtimeResult = AsyncResult.success(
      Context.make(NumberSource, NumberSource.of({ values: [1] }))
    );
    listeners.forEach((listener) => listener());
    await Effect.runPromise(Effect.yieldNow);

    expect(started).not.toHaveBeenCalled();
    unregister();
    actor.stop();
  });

  it("creates standalone service-backed stream actors from an XState runtime", async () => {
    const runtime = xstateRuntime(
      Atom.runtime(
        Layer.succeed(NumberSource, NumberSource.of({ values: [8, 9] }))
      )
    );
    const logic = fromStream({
      stream: () =>
        Stream.unwrap(
          Effect.gen(function* () {
            const source = yield* NumberSource;
            return Stream.fromIterable(source.values);
          })
        ),
    });
    const actor = runtime.createActor({ logic });

    actor.start();

    const snapshot = await waitForStatus(actor, "done");
    expect(snapshot.output).toEqual([8, 9]);
    expect(snapshot.count).toBe(2);

    actor.stop();
  });

  it("runs machine-invoked stream actors from a standalone XState runtime", async () => {
    const runtime = xstateRuntime(
      Atom.runtime(
        Layer.succeed(NumberSource, NumberSource.of({ values: [2, 4, 6] }))
      )
    );
    const machine = setup({
      types: {
        context: {} as { readonly values: ReadonlyArray<number> },
      },
      actors: {
        numbers: fromStream({
          stream: () =>
            Stream.unwrap(
              Effect.gen(function* () {
                const source = yield* NumberSource;
                return Stream.fromIterable(source.values);
              })
            ),
        }),
      },
    }).createMachine({
      context: { values: [] },
      invoke: {
        src: "numbers",
        onDone: {
          actions: assign({
            values: ({ event }) => event.output,
          }),
        },
      },
    });
    const actor = runtime.createActor({ logic: machine });

    actor.start();

    await vi.waitFor(() => {
      expect(actor.getSnapshot().context.values).toEqual([2, 4, 6]);
    });

    actor.stop();
  });
});

describe("fromAtom", () => {
  class PricingService extends Context.Service<
    PricingService,
    { readonly unitPrice: number }
  >()("test/AtomPricingService") {}

  it("uses the active actorAtom registry without explicitly passing it", async () => {
    const registry = AtomRegistry.make();
    const count = Atom.make(0);
    const countActor = actorAtom({ logic: fromAtom({ atom: count }) });
    const unmount = registry.mount(countActor);

    expect(registry.get(countActor)).toMatchObject({
      status: "active",
      context: 0,
    });

    registry.set(count, 2);
    await vi.waitFor(() => {
      expect(registry.get(countActor).context).toBe(2);
    });

    registry.set(countActor, { type: "atom.set", value: 5 });

    expect(registry.get(count)).toBe(5);
    expect(registry.get(countActor).context).toBe(5);

    unmount();
  });

  it("uses runtime-backed atoms from nested invoked actors", async () => {
    const registry = AtomRegistry.make();
    const runtime = xstateRuntime(
      Atom.runtime(
        Layer.succeed(PricingService, PricingService.of({ unitPrice: 19 }))
      )
    );
    const priceAtom = runtime.atom(
      Effect.gen(function* () {
        const pricing = yield* PricingService;
        return pricing.unitPrice;
      })
    );
    const childMachine = setup({
      types: {
        context: {} as { readonly price: number },
      },
      actors: {
        price: fromAtom({ atom: priceAtom }),
      },
    }).createMachine({
      context: { price: 0 },
      invoke: {
        src: "price",
        onSnapshot: {
          actions: assign({
            price: ({ context, event }) =>
              event.snapshot.context?._tag === "Success"
                ? event.snapshot.context.value
                : context.price,
          }),
        },
      },
    });
    const parentMachine = setup({
      types: {
        context: {} as { readonly childPrice: number },
      },
      actors: {
        child: childMachine,
      },
    }).createMachine({
      context: { childPrice: 0 },
      invoke: {
        src: "child",
        onSnapshot: {
          actions: assign({
            childPrice: ({ context, event }) =>
              event.snapshot.status === "active"
                ? event.snapshot.context.price
                : context.childPrice,
          }),
        },
      },
    });
    const parent = runtime.actorAtom({ logic: parentMachine });
    const unmount = registry.mount(parent);

    await vi.waitFor(() => {
      expect(registry.get(parent).context.childPrice).toBe(19);
    });

    unmount();
  });

  it("keeps automatic registries isolated across actorAtom mounts", async () => {
    const leftRegistry = AtomRegistry.make();
    const rightRegistry = AtomRegistry.make();
    const count = Atom.make(0);
    const countActor = actorAtom({ logic: fromAtom({ atom: count }) });
    const unmountLeftCount = leftRegistry.mount(count);
    const unmountRightCount = rightRegistry.mount(count);
    const unmountLeftActor = leftRegistry.mount(countActor);
    const unmountRightActor = rightRegistry.mount(countActor);

    expect(leftRegistry.get(countActor).context).toBe(0);
    expect(rightRegistry.get(countActor).context).toBe(0);

    leftRegistry.set(count, 2);
    await vi.waitFor(() => {
      expect(leftRegistry.get(countActor).context).toBe(2);
    });
    expect(rightRegistry.get(countActor).context).toBe(0);

    rightRegistry.set(count, 10);
    await vi.waitFor(() => {
      expect(rightRegistry.get(countActor).context).toBe(10);
    });
    expect(leftRegistry.get(countActor).context).toBe(2);

    leftRegistry.set(countActor, { type: "atom.set", value: 3 });

    expect(leftRegistry.get(count)).toBe(3);
    expect(rightRegistry.get(count)).toBe(10);
    expect(leftRegistry.get(countActor).context).toBe(3);
    expect(rightRegistry.get(countActor).context).toBe(10);

    unmountRightActor();
    unmountLeftActor();
    unmountRightCount();
    unmountLeftCount();
  });

  it("uses the actorAtom registry for fromAtom actors invoked by a machine", async () => {
    const registry = AtomRegistry.make();
    const count = Atom.make(0);
    const machine = setup({
      types: {
        context: {} as { readonly observed: number },
        events: {} as { readonly type: "count.set"; readonly value: number },
      },
      actors: {
        count: fromAtom({ atom: count }),
      },
    }).createMachine({
      context: { observed: -1 },
      invoke: {
        id: "count",
        src: "count",
        onSnapshot: {
          actions: assign({
            observed: ({ context, event }) =>
              event.snapshot.status === "active"
                ? event.snapshot.context
                : context.observed,
          }),
        },
      },
      on: {
        "count.set": {
          actions: sendTo("count", ({ event }) => ({
            type: "atom.set",
            value: event.value,
          })),
        },
      },
    });
    const machineAtom = actorAtom({ logic: machine });
    const unmount = registry.mount(machineAtom);

    await vi.waitFor(() => {
      expect(registry.get(machineAtom).context.observed).toBe(0);
    });

    registry.set(count, 3);
    await vi.waitFor(() => {
      expect(registry.get(machineAtom).context.observed).toBe(3);
    });

    registry.set(machineAtom, { type: "count.set", value: 7 });

    expect(registry.get(count)).toBe(7);
    await vi.waitFor(() => {
      expect(registry.get(machineAtom).context.observed).toBe(7);
    });

    unmount();
  });

  it("keeps an explicit fromAtom registry as an override", async () => {
    const actorRegistry = AtomRegistry.make();
    const explicitRegistry = AtomRegistry.make();
    const count = Atom.make(0);
    explicitRegistry.set(count, 10);
    const unmountActorCount = actorRegistry.mount(count);
    actorRegistry.set(count, 1);
    const countActor = actorAtom({
      logic: fromAtom({ atom: count, registry: explicitRegistry }),
    });
    const unmount = actorRegistry.mount(countActor);

    expect(actorRegistry.get(countActor).context).toBe(10);

    actorRegistry.set(count, 20);
    await Effect.runPromise(Effect.yieldNow);
    expect(actorRegistry.get(countActor).context).toBe(10);

    explicitRegistry.set(count, 11);
    await vi.waitFor(() => {
      expect(actorRegistry.get(countActor).context).toBe(11);
    });

    actorRegistry.set(countActor, { type: "atom.set", value: 12 });

    expect(explicitRegistry.get(count)).toBe(12);
    expect(actorRegistry.get(count)).toBe(20);

    unmount();
    unmountActorCount();
  });

  it("uses a stable private registry when created outside actorAtom", () => {
    let runs = 0;
    const value = Atom.make(() => {
      runs += 1;
      return runs;
    });
    const actor = createActor(fromAtom({ atom: value })).start();

    expect(actor.getSnapshot().context).toBe(1);

    actor.send({ type: "atom.refresh" });

    expect(actor.getSnapshot().context).toBe(2);

    actor.stop();
  });

  it("does not fabricate context when the initial Atom read fails", () => {
    const defect = new Error("atom boom");
    const value = Atom.make(() => {
      throw defect;
    });
    const actor = createActor(fromAtom({ atom: value }));

    actor.subscribe({ error: () => {} });
    actor.start();

    const snapshot = actor.getSnapshot();
    expect(snapshot.status).toBe("error");
    expect(snapshot.context).toBeUndefined();
    if (snapshot.status !== "error") {
      throw new Error("Expected error snapshot");
    }
    expect(Cause.hasDies(snapshot.cause)).toBe(true);

    actor.stop();
  });

  it("mirrors writable Atom changes in both directions", async () => {
    const registry = AtomRegistry.make();
    const count = Atom.make(0);
    const actor = createActor(fromAtom({ atom: count, registry }));

    actor.start();

    expect(actor.getSnapshot()).toMatchObject({
      status: "active",
      context: 0,
    });

    registry.set(count, 2);
    await vi.waitFor(() => {
      expect(actor.getSnapshot().context).toBe(2);
    });

    actor.send({ type: "atom.set", value: 5 });
    expect(registry.get(count)).toBe(5);
    expect(actor.getSnapshot().context).toBe(5);

    actor.stop();
  });

  it("re-reads the Atom value when the actor starts", () => {
    const registry = AtomRegistry.make();
    const count = Atom.make(0);
    const actor = createActor(fromAtom({ atom: count, registry }));

    registry.set(count, 5);
    actor.start();

    expect(actor.getSnapshot()).toMatchObject({
      status: "active",
      context: 5,
    });

    actor.stop();
  });

  it("refreshes derived Atoms on demand", () => {
    let runs = 0;
    const registry = AtomRegistry.make();
    const value = Atom.make(() => {
      runs += 1;
      return runs;
    });
    const actor = createActor(fromAtom({ atom: value, registry })).start();

    expect(actor.getSnapshot().context).toBe(1);

    actor.send({ type: "atom.refresh" });

    expect(actor.getSnapshot().context).toBe(2);

    actor.stop();
  });

  it("unsubscribes from Atom updates after stop", async () => {
    const registry = AtomRegistry.make();
    const count = Atom.make(0);
    const actor = createActor(fromAtom({ atom: count, registry })).start();

    actor.send({ type: "xstate.stop" });
    expect(actor.getSnapshot()).toMatchObject({
      status: "stopped",
      context: 0,
    });

    registry.set(count, 10);
    await Effect.runPromise(Effect.yieldNow);

    expect(actor.getSnapshot()).toMatchObject({
      status: "stopped",
      context: 0,
    });
  });

  it("ignores manual Atom events once stopped", () => {
    const registry = AtomRegistry.make();
    const count = Atom.make(0);
    const actor = createActor(fromAtom({ atom: count, registry })).start();

    actor.send({ type: "xstate.stop" });
    actor.send({ type: "atom.set", value: 20 });
    actor.send({ type: "atom.refresh" });

    expect(actor.getSnapshot()).toMatchObject({
      status: "stopped",
      context: 0,
    });
    expect(registry.get(count)).toBe(0);
  });

  it("stops fromAtom actors when their owning registry is disposed", () => {
    const registry = AtomRegistry.make();
    const count = Atom.make(0);
    const countActor = actorAtom({ logic: fromAtom({ atom: count }) });
    const unmount = registry.mount(countActor);
    const actor = registry.get(countActor.actor);

    expect(actor.getSnapshot()).toMatchObject({
      status: "active",
      context: 0,
    });

    registry.dispose();

    expect(actor.getSnapshot()).toMatchObject({
      status: "stopped",
      context: 0,
    });
    unmount();
  });
});

describe("failure helpers", () => {
  it("extracts causes from Effect, Stream, and Atom actor snapshots", async () => {
    const effectActor = createActor(
      fromEffect({
        effect: () => Effect.fail("effect failed" as const),
      })
    );
    effectActor.subscribe({ error: () => {} });
    effectActor.start();

    const effectSnapshot = await waitForStatus(effectActor, "error");
    expect(isFailureSnapshot(effectSnapshot)).toBe(true);
    if (!isFailureSnapshot<"effect failed">(effectSnapshot)) {
      throw new Error("Expected Effect failure snapshot");
    }
    expect(failureCause(effectSnapshot)).toEqual(Cause.fail("effect failed"));
    expect(failureValue(effectSnapshot)).toBe("effect failed");
    expect(prettyCause(failureCause(effectSnapshot))).toContain(
      "effect failed"
    );

    const streamActor = createActor(
      fromStream({
        stream: () => Stream.fail("stream failed" as const),
      })
    );
    streamActor.subscribe({ error: () => {} });
    streamActor.start();

    const streamSnapshot = await waitForStatus(streamActor, "error");
    expect(isFailureSnapshot(streamSnapshot)).toBe(true);
    if (!isFailureSnapshot<"stream failed">(streamSnapshot)) {
      throw new Error("Expected Stream failure snapshot");
    }
    expect(failureCause(streamSnapshot)).toEqual(Cause.fail("stream failed"));
    expect(failureValue(streamSnapshot)).toBe("stream failed");

    const atomDefect = new Error("atom failed");
    const atomActor = createActor(
      fromAtom({
        atom: Atom.make(() => {
          throw atomDefect;
        }),
      })
    );
    atomActor.subscribe({ error: () => {} });
    atomActor.start();

    const atomSnapshot = atomActor.getSnapshot();
    expect(isFailureSnapshot(atomSnapshot)).toBe(true);
    if (!isFailureSnapshot(atomSnapshot)) {
      throw new Error("Expected Atom failure snapshot");
    }
    expect(Cause.hasDies(failureCause(atomSnapshot))).toBe(true);
    expect(failureValue(atomSnapshot)).toBeUndefined();

    effectActor.stop();
    streamActor.stop();
    atomActor.stop();
  });
});

describe("actorAtom", () => {
  const counterMachine = setup({
    types: {
      context: {} as { readonly count: number },
      events: {} as { readonly type: "counter.increment"; readonly by: number },
      emitted: {} as {
        readonly type: "counter.changed";
        readonly count: number;
      },
    },
  }).createMachine({
    context: { count: 0 },
    on: {
      "counter.increment": {
        actions: [
          assign({
            count: ({ context, event }) => context.count + event.by,
          }),
          emit(({ context }) => ({
            type: "counter.changed",
            count: context.count,
          })),
        ],
      },
    },
  });

  it("exposes an XState actor as a writable Atom", () => {
    const registry = AtomRegistry.make();
    const counter = actorAtom({ logic: counterMachine });
    const unmount = registry.mount(counter);

    expect(registry.get(counter).context.count).toBe(0);

    registry.set(counter, { type: "counter.increment", by: 2 });

    expect(registry.get(counter).context.count).toBe(2);

    unmount();
  });

  it("selects snapshots, emitted events, and XState persisted snapshots", () => {
    const registry = AtomRegistry.make();
    const counter = actorAtom({ logic: counterMachine });
    const selected = selectAtom({
      actor: counter,
      selector: (snapshot) => snapshot.context.count,
    });
    const emittedEvent = emittedAtom({
      actor: counter,
      type: "counter.changed",
    });
    const persisted = persistedAtom({ actor: counter });
    const unmountCounter = registry.mount(counter);
    const unmountSelected = registry.mount(selected);
    const unmountEmitted = registry.mount(emittedEvent);
    const unmountPersisted = registry.mount(persisted);

    expect(registry.get(selected)).toBe(0);
    expect(Option.isNone(registry.get(emittedEvent))).toBe(true);

    registry.set(counter, { type: "counter.increment", by: 4 });

    expect(registry.get(selected)).toBe(4);
    expect(registry.get(emittedEvent)).toEqual(
      Option.some({ type: "counter.changed", count: 4 })
    );
    expect(registry.get(persisted)).toMatchObject({
      context: { count: 4 },
    });

    unmountPersisted();
    unmountEmitted();
    unmountSelected();
    unmountCounter();
  });
});
