// @vitest-environment jsdom
import { Context, Effect, Layer, Stream } from "effect";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { fromEffect, fromStream, runtime as xstateRuntime } from "../src/main";

describe("React integration", () => {
  class PricingService extends Context.Service<
    PricingService,
    { readonly unitPrice: number }
  >()("test/ReactPricingService") {}

  class TickerService extends Context.Service<
    TickerService,
    { readonly read: () => string }
  >()("test/ReactTickerService") {}

  it("runs runtime actor atoms through RegistryContext", async () => {
    const registry = AtomRegistry.make();
    let tick = 0;
    const runtime = xstateRuntime(
      Atom.runtime(
        Layer.mergeAll(
          Layer.succeed(PricingService, PricingService.of({ unitPrice: 14 })),
          Layer.succeed(
            TickerService,
            TickerService.of({
              read: () => `tick-${++tick}`,
            })
          )
        )
      )
    );
    const quoteActor = runtime.actorAtom({
      logic: fromEffect({
        effect: (scope: { readonly input: { readonly quantity: number } }) =>
          Effect.gen(function* () {
            const pricing = yield* PricingService;
            return scope.input.quantity * pricing.unitPrice;
          }),
      }),
      options: { input: { quantity: 3 } },
    });
    const tickerActor = runtime.actorAtom({
      logic: fromStream({
        stream: () =>
          Stream.unwrap(
            Effect.gen(function* () {
              const ticker = yield* TickerService;
              return Stream.tick("5 millis").pipe(
                Stream.map(() => ticker.read())
              );
            })
          ),
        accumulation: { mode: "latest" },
      }),
    });
    const document = (globalThis as any).document;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container as any);

    const View = () => {
      const quote = useAtomValue(quoteActor);
      const ticker = useAtomValue(tickerActor);
      return React.createElement(
        "div",
        null,
        `${quote.status}:${quote.output ?? ""}|${ticker.status}:${
          ticker.latest ?? ""
        }:${ticker.count}`
      );
    };

    await act(async () => {
      root.render(
        React.createElement(
          RegistryContext.Provider,
          { value: registry },
          React.createElement(View)
        )
      );
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain("done:42");
    });
    await vi.waitFor(() => {
      expect(container.textContent).toMatch(/active:tick-\d+:[1-9]\d*/);
    });

    await act(async () => {
      root.unmount();
    });
    registry.dispose();
    container.remove();
  });
});
