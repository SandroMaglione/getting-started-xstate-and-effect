import { useAtomSet, useAtomValue } from "@effect/atom-react";
import type { ReactElement } from "react";
import {
  canPayAtom,
  canRequestQuoteAtom,
  checkoutActor,
  checkoutStatusAtom,
  quoteAtom,
} from "./domain";
import { formatCurrency } from "./format";
import { RenderCount } from "./render-count";

export const CheckoutPanel = (): ReactElement => {
  const status = useAtomValue(checkoutStatusAtom);
  const quote = useAtomValue(quoteAtom);
  const canRequestQuote = useAtomValue(canRequestQuoteAtom);
  const canPay = useAtomValue(canPayAtom);
  const send = useAtomSet(checkoutActor);

  return (
    <div className="panel primary-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">actorAtom + selectAtom</p>
          <h2>Checkout machine</h2>
        </div>
        <RenderCount label="machine selectors" />
      </div>
      <div className="metric-row">
        <div className="metric">
          <span>State</span>
          <strong>{status}</strong>
        </div>
        <div className="metric">
          <span>Quote</span>
          <strong>
            {quote === null ? "None" : formatCurrency({ value: quote.total })}
          </strong>
        </div>
        <div className="metric">
          <span>Runtime service</span>
          <strong>
            {quote === null
              ? "Ready"
              : `${formatCurrency({ value: quote.unitPrice })} / unit`}
          </strong>
        </div>
      </div>
      <div className="action-row">
        <button
          className="primary-button"
          disabled={!canRequestQuote}
          onClick={() => {
            send({ type: "quote.requested" });
          }}
        >
          Request quote
        </button>
        <button
          className="primary-button"
          disabled={!canPay}
          onClick={() => {
            send({ type: "payment.confirmed" });
          }}
        >
          Pay
        </button>
        <button
          className="secondary-button"
          onClick={() => {
            send({ type: "checkout.reset" });
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
};
