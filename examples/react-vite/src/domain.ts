import {
  emittedAtom,
  fromAtom,
  fromEffect,
  fromStream,
  persistedAtom,
  runtime as xstateRuntime,
  selectAtom,
} from "../../../src/main";
import { Context, Effect, Layer, Schedule, Stream } from "effect";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";
import { assign, emit, setup } from "xstate";

export type Quote = {
  readonly quantity: number;
  readonly unitPrice: number;
  readonly total: number;
};

export type PaymentSubmittedEvent = {
  readonly type: "payment.submitted";
  readonly total: number;
};

type CheckoutContext = {
  readonly quantity: number;
  readonly quote: Quote | null;
};

type CheckoutEvent =
  | { readonly type: "quote.requested" }
  | { readonly type: "payment.confirmed" }
  | { readonly type: "checkout.reset" };

interface PricingService {
  readonly quote: (quantity: number) => Effect.Effect<Quote>;
}

const PricingService = Context.Service<PricingService>("PricingService");

export const registry = AtomRegistry.make();

export const runtime = xstateRuntime(
  Atom.runtime(
    Layer.succeed(
      PricingService,
      PricingService.of({
        quote: (quantity) =>
          Effect.succeed({
            quantity,
            unitPrice: 12,
            total: quantity * 12,
          }).pipe(Effect.delay("350 millis")),
      })
    )
  )
);

export const quantityAtom = Atom.make(1);

export const checkoutMachine = setup({
  types: {
    context: {} as CheckoutContext,
    events: {} as CheckoutEvent,
    emitted: {} as PaymentSubmittedEvent,
  },
  actors: {
    quantity: fromAtom({
      atom: quantityAtom,
    }),
    pricing: fromEffect({
      effect: (scope: { readonly input: { readonly quantity: number } }) =>
        Effect.gen(function* () {
          const service = yield* PricingService;
          return yield* service.quote(scope.input.quantity);
        }),
    }),
  },
}).createMachine({
  id: "actor-atom-simple-checkout",
  context: {
    quantity: 1,
    quote: null,
  },
  invoke: {
    src: "quantity",
    onSnapshot: {
      target: ".editing",
      actions: assign({
        quantity: ({ context, event }) =>
          event.snapshot.context ?? context.quantity,
        quote: null,
      }),
    },
  },
  initial: "editing",
  states: {
    editing: {
      on: {
        "quote.requested": {
          target: "pricing",
          guard: ({ context }) => context.quantity > 0,
        },
      },
    },
    pricing: {
      invoke: {
        src: "pricing",
        input: ({ context }) => ({ quantity: context.quantity }),
        onDone: {
          target: "quoted",
          actions: assign({
            quote: ({ event }) => event.output,
          }),
        },
        onError: {
          target: "editing",
        },
      },
    },
    quoted: {
      on: {
        "quote.requested": {
          target: "pricing",
        },
        "payment.confirmed": {
          target: "paid",
        },
      },
    },
    paid: {
      entry: emit(({ context }) => ({
        type: "payment.submitted",
        total: context.quote?.total ?? 0,
      })),
      on: {
        "checkout.reset": {
          target: "editing",
          actions: assign({
            quote: null,
          }),
        },
      },
    },
  },
});

export const checkoutActor = runtime.actorAtom({
  logic: checkoutMachine,
});

export const checkoutStatusAtom = selectAtom({
  actor: checkoutActor,
  selector: (snapshot) => String(snapshot.value),
});

export const quoteAtom = selectAtom({
  actor: checkoutActor,
  selector: (snapshot) => snapshot.context.quote,
});

export const tickerActor = runtime.actorAtom({
  logic: fromStream({
    accumulation: { mode: "collect", maxItems: 5 },
    stream: () => {
      let count = 0;
      return Stream.fromEffectSchedule(
        Effect.sync(() => {
          count += 1;
          return `tick ${count} at ${new Date().toLocaleTimeString()}`;
        }),
        Schedule.spaced("1 second")
      );
    },
  }),
});

export const tickerAtom = selectAtom({
  actor: tickerActor,
  selector: (snapshot) => ({
    count: snapshot.count,
    latest: snapshot.latest ?? "Waiting for first tick",
    recent: snapshot.items,
  }),
});

export const canRequestQuoteAtom = selectAtom({
  actor: checkoutActor,
  selector: (snapshot) =>
    (snapshot.matches("editing") || snapshot.matches("quoted")) &&
    snapshot.context.quantity > 0,
});

export const canPayAtom = selectAtom({
  actor: checkoutActor,
  selector: (snapshot) =>
    snapshot.matches("quoted") && snapshot.context.quote !== null,
});

export const paymentAtom = emittedAtom({
  actor: checkoutActor,
  type: "payment.submitted",
});

export const persistedCheckoutAtom = persistedAtom({
  actor: checkoutActor,
});
