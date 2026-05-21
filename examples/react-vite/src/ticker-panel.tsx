import { useAtomValue } from "@effect/atom-react";
import type { ReactElement } from "react";
import { tickerAtom } from "./domain";
import { RenderCount } from "./render-count";

export const TickerPanel = (): ReactElement => {
  const ticker = useAtomValue(tickerAtom);

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">fromStream</p>
          <h2>Scheduled stream</h2>
        </div>
        <RenderCount label="ticker" />
      </div>
      <div className="metric-row compact">
        <div className="metric">
          <span>Latest</span>
          <strong>{ticker.latest}</strong>
        </div>
        <div className="metric">
          <span>Items</span>
          <strong>{ticker.count}</strong>
        </div>
      </div>
      <ul className="activity-list">
        {ticker.recent.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
};
