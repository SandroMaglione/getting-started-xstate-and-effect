import { useMachine, useSelector } from "@xstate/react";
import { useEffect } from "react";
import type { ActorRefFrom } from "xstate";
import {
  rootMachine,
  type notifierMachine,
  type uploadMachine,
} from "./machine";

export default function App() {
  const [snapshot] = useMachine(rootMachine);
  const notifierActor = snapshot.children["notifier"];

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

  return (
    <>
      {notifierActor && <NotifierMachine actor={notifierActor} />}
      <Child child={snapshot.context.child} />
    </>
  );
}

const NotifierMachine = ({
  actor,
}: {
  actor: ActorRefFrom<typeof notifierMachine>;
}) => {
  const context = useSelector(actor, (snapshot) => snapshot.context);
  return (
    <div>
      <p>Notifier machine context</p>
      <pre>{JSON.stringify(context, null, 2)}</pre>
    </div>
  );
};

/// 👇 Isolated logic for "child" machine, no reference to `root`
const Child = ({ child }: { child: ActorRefFrom<typeof uploadMachine> }) => {
  /// 🪄 `useSelector` to extract context from `child` actor
  const value = useSelector(child, (snapshot) => snapshot.context.value);
  return (
    <>
      <p>{`Child value: ${value}`}</p>
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
    </>
  );
};
