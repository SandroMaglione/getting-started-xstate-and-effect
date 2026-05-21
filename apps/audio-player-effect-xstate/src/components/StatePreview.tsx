import { useAtomValue } from "@effect/atom-react";
import { stateAtom } from "../atoms";
import { RenderCount, useRenderCount } from "./RenderCount";

export const StatePreview = () => {
  const state = useAtomValue(stateAtom);
  const renderCount = useRenderCount();

  return (
    <section className="panel">
      <div className="panel-header">
        <span>State</span>
        <RenderCount count={renderCount} />
      </div>
      <pre>{JSON.stringify(state, null, 2)}</pre>
    </section>
  );
};
