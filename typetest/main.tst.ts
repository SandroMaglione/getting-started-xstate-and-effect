import { Cause, Context, Effect, Layer, Option, Stream } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { describe, expect, it } from "tstyche";
import {
  type EmittedFrom,
  type EventFromLogic,
  type InputFrom,
  setup,
  type SnapshotFrom,
} from "xstate";
import {
  actorAtom,
  emittedAtom,
  type EffectActorEvent,
  type EffectActorSnapshot,
  type FailureSnapshot,
  failureCause,
  failureValue,
  fromAtom,
  type AtomActorEvent,
  type AtomActorSnapshot,
  fromEffect,
  fromStream,
  isFailureSnapshot,
  prettyCause,
  runtime as xstateRuntime,
  type StreamActorEvent,
  type StreamActorSnapshot,
} from "@typeonce/effect-xstate";

describe("fromEffect", () => {
  class PricingService extends Context.Service<
    PricingService,
    { readonly unitPrice: number }
  >()("test/PricingService") {}

  it("infers input, output, failure, and emitted event types", () => {
    const logic = fromEffect({
      effect: (scope: {
        readonly input: { readonly quantity: number };
        readonly emit: (event: {
          readonly type: "quote.calculated";
          readonly total: number;
        }) => void;
      }) => {
        expect(scope.input.quantity).type.toBe<number>();
        expect(scope.emit).type.toBeCallableWith({
          type: "quote.calculated",
          total: 12,
        });
        expect(scope.emit).type.not.toBeCallableWith({
          type: "quote.rejected",
        });
        return Effect.succeed(scope.input.quantity * 12);
      },
    });

    expect<InputFrom<typeof logic>>().type.toBe<{
      readonly quantity: number;
    }>();
    expect<SnapshotFrom<typeof logic>>().type.toBe<
      EffectActorSnapshot<number, never, { readonly quantity: number }>
    >();
    expect<EventFromLogic<typeof logic>>().type.toBe<
      EffectActorEvent<number, never>
    >();
    expect<EventFromLogic<typeof logic>>().type.not.toBeAssignableTo<{
      readonly type: "effect.success";
      readonly value: number;
    }>();
    expect<EmittedFrom<typeof logic>>().type.toBe<{
      readonly type: "quote.calculated";
      readonly total: number;
    }>();
  });

  it("preserves typed failures", () => {
    const logic = fromEffect({
      effect: (_scope: { readonly input: string }) =>
        Effect.fail({ _tag: "PricingError" as const }),
    });

    expect<SnapshotFrom<typeof logic>>().type.toBe<
      EffectActorSnapshot<
        never,
        { _tag: "PricingError" },
        string
      >
    >();
    expect<EventFromLogic<typeof logic>>().type.toBe<
      EffectActorEvent<never, { _tag: "PricingError" }>
    >();
  });

  it("accepts Effect services through an actorAtom runtime", () => {
    const runtime = xstateRuntime(
      Atom.runtime(
        Layer.succeed(PricingService, PricingService.of({ unitPrice: 12 }))
      )
    );
    const logic = fromEffect({
      effect: (scope: { readonly input: { readonly quantity: number } }) =>
        Effect.gen(function* () {
          const service = yield* PricingService;
          return scope.input.quantity * service.unitPrice;
        }),
    });

    expect<InputFrom<typeof logic>>().type.toBe<{
      readonly quantity: number;
    }>();
    expect<SnapshotFrom<typeof logic>>().type.toBe<
      EffectActorSnapshot<number, never, { readonly quantity: number }>
    >();
    expect(runtime.actorAtom).type.toBeCallableWith({
      logic,
      options: { input: { quantity: 1 } },
    });
    expect(runtime.atom).type.toBeCallableWith(Effect.succeed(1));
    expect(actorAtom).type.not.toBeCallableWith({
      logic,
      options: { input: { quantity: 1 } },
    });
  });

  it("includes Atom runtime failures in runtime-backed actor Atom snapshots", () => {
    const runtimeAtom = Atom.make<
      AsyncResult.AsyncResult<Context.Context<PricingService>, "runtime failed">
    >(
      AsyncResult.failure<Context.Context<PricingService>, "runtime failed">(
        Cause.fail("runtime failed" as const)
      )
    );
    const logic = fromEffect({
      effect: () => Effect.fail({ _tag: "PricingError" as const }),
    });
    const actor = actorAtom({ logic, runtime: runtimeAtom });

    expect<
      Extract<
        Atom.Type<typeof actor>,
        { readonly status: "error" }
      >["error"]
    >().type.toBe<
      Cause.Cause<{ _tag: "PricingError" } | "runtime failed">
    >();
  });

  it("includes Atom runtime failures in standalone runtime actor snapshots", () => {
    const runtime = xstateRuntime(
      Atom.runtime(Layer.effectDiscard(Effect.fail("runtime failed" as const)))
    );
    const logic = fromEffect({
      effect: () => Effect.fail({ _tag: "PricingError" as const }),
    });
    const actor = runtime.createActor({ logic });

    expect<
      Extract<
        ReturnType<typeof actor.getSnapshot>,
        { readonly status: "error" }
      >["error"]
    >().type.toBe<
      Cause.Cause<{ _tag: "PricingError" } | "runtime failed">
    >();
    actor.subscribe((snapshot) => {
      if (snapshot.status === "error") {
        expect(snapshot.cause).type.toBe<
          Cause.Cause<{ _tag: "PricingError" } | "runtime failed">
        >();
      }
    });
  });

  it("propagates invoked Effect service requirements through machines", () => {
    const runtime = xstateRuntime(
      Atom.runtime(
        Layer.succeed(PricingService, PricingService.of({ unitPrice: 12 }))
      )
    );
    const machine = setup({
      actors: {
        pricing: fromEffect({
          effect: () =>
            Effect.gen(function* () {
              const service = yield* PricingService;
              return service.unitPrice;
            }),
        }),
      },
    }).createMachine({
      invoke: {
        src: "pricing",
      },
    });

    expect(actorAtom).type.not.toBeCallableWith({ logic: machine });
    expect(runtime.actorAtom).type.toBeCallableWith({ logic: machine });
  });
});

describe("fromStream", () => {
  class NumberSource extends Context.Service<
    NumberSource,
    { readonly values: ReadonlyArray<number> }
  >()("test/NumberSource") {}

  it("infers input, stream item, failure, and emitted event types", () => {
    const logic = fromStream({
      stream: (scope: {
        readonly input: { readonly values: ReadonlyArray<number> };
        readonly emit: (event: {
          readonly type: "stream.item";
          readonly value: number;
        }) => void;
      }) => {
        expect(scope.input.values).type.toBe<ReadonlyArray<number>>();
        expect(scope.emit).type.toBeCallableWith({
          type: "stream.item",
          value: 1,
        });
        expect(scope.emit).type.not.toBeCallableWith({
          type: "stream.item",
          value: "1",
        });
        return Stream.fromIterable(scope.input.values);
      },
    });

    expect<InputFrom<typeof logic>>().type.toBe<{
      readonly values: ReadonlyArray<number>;
    }>();
    expect<SnapshotFrom<typeof logic>>().type.toBe<
      StreamActorSnapshot<number, never, {
        readonly values: ReadonlyArray<number>;
      }>
    >();
    expect<EventFromLogic<typeof logic>>().type.toBe<
      StreamActorEvent<number, never>
    >();
    expect<EventFromLogic<typeof logic>>().type.not.toBeAssignableTo<{
      readonly type: "stream.next";
      readonly value: number;
    }>();
    expect<EmittedFrom<typeof logic>>().type.toBe<{
      readonly type: "stream.item";
      readonly value: number;
    }>();
  });

  it("preserves stream failure types", () => {
    const logic = fromStream({
      stream: () => Stream.fail("stream failed" as const),
    });

    expect<SnapshotFrom<typeof logic>>().type.toBe<
      StreamActorSnapshot<never, "stream failed", void>
    >();
    expect<EventFromLogic<typeof logic>>().type.toBe<
      StreamActorEvent<never, "stream failed">
    >();
  });

  it("infers reduced stream accumulator values", () => {
    const logic = fromStream({
      stream: () => Stream.fromIterable([1, 2, 3]),
      accumulation: {
        mode: "reduce",
        seed: 0,
        reducer: (sum, value) => {
          expect(sum).type.toBe<number>();
          expect(value).type.toBe<number>();
          return sum + value;
        },
      },
    });

    expect<SnapshotFrom<typeof logic>>().type.toBe<
      StreamActorSnapshot<number, never, void, number>
    >();
  });

  it("accepts Stream services through an actorAtom runtime", () => {
    const runtime = xstateRuntime(
      Atom.runtime(
        Layer.succeed(NumberSource, NumberSource.of({ values: [1, 2] }))
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

    expect<SnapshotFrom<typeof logic>>().type.toBe<
      StreamActorSnapshot<number, never, void>
    >();
    expect(runtime.actorAtom).type.toBeCallableWith({ logic });
    expect(actorAtom).type.not.toBeCallableWith({ logic });
  });

  it("includes Atom runtime failures in standalone runtime stream snapshots", () => {
    const runtime = xstateRuntime(
      Atom.runtime(Layer.effectDiscard(Effect.fail("runtime failed" as const)))
    );
    const logic = fromStream({
      stream: () => Stream.fail("stream failed" as const),
    });
    const actor = runtime.createActor({ logic });

    expect<
      Extract<
        ReturnType<typeof actor.getSnapshot>,
        { readonly status: "error" }
      >["error"]
    >().type.toBe<Cause.Cause<"stream failed" | "runtime failed">>();
    const status = actor.select((snapshot) => snapshot.status);
    expect<ReturnType<typeof status.get>>().type.toBe<
      "active" | "done" | "error" | "stopped"
    >();
  });
});

describe("fromAtom", () => {
  it("turns writable Atoms into actor logic with set events", () => {
    const count = Atom.make(0);
    const logic = fromAtom({ atom: count });

    expect<InputFrom<typeof logic>>().type.toBe<void>();
    expect<SnapshotFrom<typeof logic>>().type.toBe<AtomActorSnapshot<number>>();
    expect<EventFromLogic<typeof logic>>().type.toBe<
      AtomActorEvent<number, number>
    >();
    expect<EventFromLogic<typeof logic>>().type.toBeAssignableTo<
      | { readonly type: "atom.refresh" }
      | { readonly type: "atom.set"; readonly value: number }
      | { readonly type: "xstate.stop" }
    >();
    expect<EventFromLogic<typeof logic>>().type.not.toBeAssignableTo<{
      readonly type: "atom.changed";
      readonly value: number;
    }>();
    expect(actorAtom).type.toBeCallableWith({ logic });
  });

  it("turns read-only Atoms into actor logic without set payloads", () => {
    const greeting = Atom.make(() => "hello");
    const logic = fromAtom({ atom: greeting });

    expect<SnapshotFrom<typeof logic>>().type.toBe<AtomActorSnapshot<string>>();
    expect<EventFromLogic<typeof logic>>().type.toBe<
      AtomActorEvent<string, never>
    >();
  });

  it("does not claim an Atom context exists on initial read failure", () => {
    expect<
      Extract<
        AtomActorSnapshot<number>,
        { readonly status: "error" }
      >["context"]
    >().type.toBe<number | undefined>();
  });
});

describe("actorAtom", () => {
  it("preserves machine snapshot and event types", () => {
    const machine = setup({
      types: {
        context: {} as { readonly count: number },
        events: {} as
          | { readonly type: "increment"; readonly by: number }
          | { readonly type: "reset" },
        emitted: {} as { readonly type: "count.changed"; readonly value: number },
      },
    }).createMachine({
      context: { count: 0 },
      on: {
        increment: {
          actions: ({ event }) => {
            expect(event.by).type.toBe<number>();
          },
        },
        reset: {},
      },
    });

    const actor = actorAtom({ logic: machine });
    const changed = emittedAtom({ actor, type: "count.changed" });

    expect(actor).type.toHaveProperty("actor");
    expect(actor).type.toBeAssignableTo<
      Atom.Writable<SnapshotFrom<typeof machine>, EventFromLogic<typeof machine>>
    >();
    expect(changed).type.toBe<
      Atom.Atom<
        Option.Option<{ readonly type: "count.changed"; readonly value: number }>
      >
    >();
  });

  it("requires options when actor logic requires input", () => {
    const machine = setup({
      types: {
        context: {} as { readonly count: number },
        input: {} as { readonly initial: number },
      },
    }).createMachine({
      context: ({ input }) => ({ count: input.initial }),
    });

    expect(actorAtom).type.toBeCallableWith({
      logic: machine,
      options: { input: { initial: 1 } },
    });
    expect(actorAtom).type.not.toBeCallableWith({ logic: machine });
  });
});

describe("exported event and snapshot types", () => {
  it("model failed Effect snapshots with typed causes", () => {
    expect<
      Extract<
        EffectActorSnapshot<number, "boom", void>,
        { readonly status: "error" }
      >["error"]
    >().type.toBe<Cause.Cause<"boom">>();
  });

  it("exposes shared failure helpers for all Cause-backed snapshots", () => {
    const snapshot = {
      status: "error",
      output: undefined,
      error: Cause.fail("boom" as const),
    } as FailureSnapshot<"boom">;

    expect<FailureSnapshot<"boom">["error"]>().type.toBe<Cause.Cause<"boom">>();
    expect(isFailureSnapshot).type.toBeCallableWith(snapshot);
    expect(failureCause(snapshot)).type.toBe<Cause.Cause<"boom">>();
    expect(failureValue(snapshot)).type.toBe<"boom" | undefined>();
    expect(prettyCause).type.toBeCallableWith(Cause.fail("boom" as const));
  });
});
