import { useMachine } from "@xstate/react";
import { useRef } from "react";
import { machine } from "./machine";

export default function App() {
  const audio = useRef<HTMLAudioElement>(null);
  const [snapshot, send] = useMachine(machine, {
    input: { audioRef: audio.current! }, // TODO: Unsafe bang `!`
  });

  return (
    <div>
      <audio
        crossOrigin="anonymous"
        ref={audio}
        src="TODO"
        onTimeUpdate={() => {
          // TODO
        }}
        onLoadedData={() => send({ type: "loaded" })}
        onPause={() => send({ type: "pause" })}
        onPlay={() => send({ type: "play" })}
        onEnded={() => send({ type: "end" })}
      ></audio>
    </div>
  );
}
