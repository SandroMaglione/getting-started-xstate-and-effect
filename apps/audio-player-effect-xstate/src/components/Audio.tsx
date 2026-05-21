import { useAtomSet } from "@effect/atom-react";
import { audioPlayerActor } from "../atoms";
import { RenderCount, useRenderCount } from "./RenderCount";

export const Audio = () => {
  const send = useAtomSet(audioPlayerActor);
  const renderCount = useRenderCount();

  return (
    <section className="panel">
      <div className="panel-header">
        <span>Audio</span>
        <RenderCount count={renderCount} />
      </div>
      <audio
        crossOrigin="anonymous"
        src="/Scarred_and_Unstoppable.mp3"
        onTimeUpdate={({ currentTarget: audioRef }) =>
          send({ type: "time", params: { updatedTime: audioRef.currentTime } })
        }
        onError={({ type }) =>
          send({ type: "initError", params: { message: type } })
        }
        onLoadedData={({ currentTarget: audioRef }) =>
          send({ type: "loading", params: { audioRef } })
        }
        onEnded={() => send({ type: "end" })}
      />
    </section>
  );
};
