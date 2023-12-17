import { useMachine } from "@xstate/react";
import { Match } from "effect";
import { useRef } from "react";
import { machine } from "./machine";

export default function App() {
  const audio = useRef<HTMLAudioElement>(null);
  const [snapshot, send] = useMachine(machine);
  return (
    <div>
      <pre>{JSON.stringify(snapshot.value, null, 2)}</pre>
      <audio
        crossOrigin="anonymous"
        ref={audio}
        src="https://audio.transistor.fm/m/shows/40155/2658917e74139f25a86a88d346d71324.mp3"
        onTimeUpdate={() => {
          // TODO
        }}
        onLoadedData={(e) =>
          send({
            type: "loading",
            params: { audioRef: e.currentTarget },
          })
        }
        onPause={() => send({ type: "pause" })}
        onEnded={() => send({ type: "end" })}
      />

      {Match.value(snapshot.value).pipe(
        Match.when("Paused", () => (
          <button onClick={() => send({ type: "play" })}>Play</button>
        )),
        Match.when("Playing", () => (
          <button onClick={() => send({ type: "pause" })}>Pause</button>
        )),
        Match.orElse(() => <p>...</p>)
      )}
    </div>
  );
}
