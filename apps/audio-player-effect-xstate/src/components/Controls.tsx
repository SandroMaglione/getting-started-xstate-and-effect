import { useAtomSet, useAtomValue } from "@effect/atom-react";
import {
  audioPlayerActor,
  canPauseAtom,
  canPlayAtom,
  canRestartAtom,
} from "../atoms";
import { RenderCount, useRenderCount } from "./RenderCount";

export const Controls = () => {
  const send = useAtomSet(audioPlayerActor);
  const canPlay = useAtomValue(canPlayAtom);
  const canPause = useAtomValue(canPauseAtom);
  const canRestart = useAtomValue(canRestartAtom);
  const renderCount = useRenderCount();

  return (
    <section className="panel">
      <div className="panel-header">
        <span>Controls</span>
        <RenderCount count={renderCount} />
      </div>

      <div className="controls">
        {canPlay && <button onClick={() => send({ type: "play" })}>Play</button>}

        {canPause && (
          <button onClick={() => send({ type: "pause" })}>Pause</button>
        )}

        {canRestart && (
          <button onClick={() => send({ type: "restart" })}>Restart</button>
        )}
      </div>
    </section>
  );
};
