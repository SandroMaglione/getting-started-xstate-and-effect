import type { ReactElement } from "react";
import { CheckoutPanel } from "./checkout-panel";
import { QuantityPanel } from "./quantity-panel";
import { SideChannelsPanel } from "./side-channels-panel";
import { TickerPanel } from "./ticker-panel";

export const App = (): ReactElement => {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Effect Atom + XState</p>
        <h1>Small checkout flow</h1>
        <p>
          Quantity is an Effect Atom. The machine reads it through fromAtom,
          prices it through a custom Atom runtime service, and React reads the
          machine through normal Atom hooks.
        </p>
      </section>
      <section className="grid">
        <QuantityPanel />
        <CheckoutPanel />
        <TickerPanel />
        <SideChannelsPanel />
      </section>
    </main>
  );
};
