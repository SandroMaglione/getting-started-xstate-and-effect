import { useAtomValue } from "@effect/atom-react";
import { currentTimeAtom } from "../atoms";
import { RenderCount, useRenderCount } from "./RenderCount";

export const CurrentTime = () => {
  const currentTime = useAtomValue(currentTimeAtom);
  const renderCount = useRenderCount();

  return (
    <section className="panel">
      <div className="panel-header">
        <span>Current time</span>
        <RenderCount count={renderCount} />
      </div>
      <p>{currentTime}</p>
    </section>
  );
};
