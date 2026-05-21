import { useAtomSet, useAtomValue } from "@effect/atom-react";
import type { ReactElement } from "react";
import { quantityAtom } from "./domain";
import { RenderCount } from "./render-count";

export const QuantityPanel = (): ReactElement => {
  const quantity = useAtomValue(quantityAtom);
  const setQuantity = useAtomSet(quantityAtom);

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">fromAtom</p>
          <h2>Quantity atom</h2>
        </div>
        <RenderCount label="quantity" />
      </div>
      <div className="quantity-row">
        <button
          className="icon-button"
          onClick={() => {
            setQuantity((current) => Math.max(0, current - 1));
          }}
        >
          -
        </button>
        <strong>{quantity}</strong>
        <button
          className="icon-button"
          onClick={() => {
            setQuantity((current) => current + 1);
          }}
        >
          +
        </button>
      </div>
      <p className="muted">
        Changing this atom sends a snapshot into the invoked XState actor and
        resets the quote.
      </p>
    </div>
  );
};
