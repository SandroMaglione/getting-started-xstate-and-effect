import { useMachine } from "@xstate/react";
import { useEffect } from "react";
import type { ActorRefFrom } from "xstate";
import { rootMachine, type uploadMachine } from "./machine";

export default function App() {
  const [snapshot] = useMachine(rootMachine);

  /// 🔥 Root machine can react to events triggered by child machine
  useEffect(() => {
    ///                                     👇 Access emitted event from `child`
    const { unsubscribe } = snapshot.context.child.on(
      "uploaded",
      ({ value }) => {
        console.log("Uploaded value", { value });
      }
    );

    return unsubscribe;
  }, []);

  return <Child child={snapshot.context.child} />;
}

/// 👇 Isolated logic for "child" machine, no reference to `root`
const Child = ({ child }: { child: ActorRefFrom<typeof uploadMachine> }) => {
  return (
    <button
      onClick={() =>
        child.send({
          type: "upload",
          value: Math.random(),
        })
      }
    >
      Upload
    </button>
  );
};
