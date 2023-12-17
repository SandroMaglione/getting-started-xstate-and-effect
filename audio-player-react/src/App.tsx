import { useMachine } from "@xstate/react";
import { Match } from "effect";
import { machine } from "./machine";

export default function App() {
  const [snapshot, send] = useMachine(machine);
  return (
    <div>
      <pre>{JSON.stringify(snapshot.value, null, 2)}</pre>
      <audio
        crossOrigin="anonymous"
        src="https://audio.transistor.fm/m/shows/40155/2658917e74139f25a86a88d346d71324.mp3"
        onTimeUpdate={() => send({ type: "time" })}
        onLoadedData={({ currentTarget: audioRef }) =>
          send({ type: "loading", params: { audioRef } })
        }
        onEnded={() => send({ type: "end" })}
      />

      <p>{`Current time: ${snapshot.context.currentTime}`}</p>

      <div>
        {Match.value(snapshot.value).pipe(
          Match.when({ Active: "Paused" }, () => (
            <button onClick={() => send({ type: "play" })}>Play</button>
          )),
          Match.when({ Active: "Playing" }, () => (
            <button onClick={() => send({ type: "pause" })}>Pause</button>
          )),
          Match.orElse(() => <></>)
        )}

        {(snapshot.matches({ Active: "Paused" }) ||
          snapshot.matches({ Active: "Playing" })) && (
          <button onClick={() => send({ type: "restart" })}>Restart</button>
        )}
      </div>
    </div>
  );
}
