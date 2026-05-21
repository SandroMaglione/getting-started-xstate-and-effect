import { useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import type { ReactElement } from "react";
import { paymentAtom, persistedCheckoutAtom } from "./domain";
import { formatCurrency } from "./format";
import { RenderCount } from "./render-count";

export const SideChannelsPanel = (): ReactElement => {
  const payment = useAtomValue(paymentAtom);
  const persisted = useAtomValue(persistedCheckoutAtom);

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">emittedAtom + persistedAtom</p>
          <h2>Actor side channels</h2>
        </div>
        <RenderCount label="side channels" />
      </div>
      <p className="event-box">
        {Option.isSome(payment)
          ? `Payment submitted for ${formatCurrency({ value: payment.value.total })}`
          : "No payment event yet"}
      </p>
      <pre className="snapshot-box">{JSON.stringify(persisted, null, 2)}</pre>
    </div>
  );
};
