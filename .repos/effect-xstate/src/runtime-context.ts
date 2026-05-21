import { Cause, Context, Exit } from "effect";
import type { AnyActorScope } from "xstate";
import type { RuntimeContextResult } from "./types.ts";

type RuntimeContextBridge = {
  readonly get: () => RuntimeContextResult<unknown, unknown>;
  readonly subscribe: (onChange: () => void) => () => void;
};

const runtimeContextBySystem = new WeakMap<
  AnyActorScope["system"],
  RuntimeContextBridge
>();

export const registerActorSystemRuntimeContext = (
  system: AnyActorScope["system"],
  bridge: RuntimeContextBridge
): (() => void) => {
  runtimeContextBySystem.set(system, bridge);
  return () => {
    runtimeContextBySystem.delete(system);
  };
};

export const getActorSystemRuntimeResult = (
  system: AnyActorScope["system"]
): RuntimeContextResult<unknown, unknown> | undefined =>
  runtimeContextBySystem.get(system)?.get();

export const subscribeActorSystemRuntime = (
  system: AnyActorScope["system"],
  onChange: () => void
): (() => void) | undefined => runtimeContextBySystem.get(system)?.subscribe(onChange);

export const getActorSystemRuntimeContextExit = (
  system: AnyActorScope["system"]
): Exit.Exit<Context.Context<unknown>, unknown> => {
  const result = getActorSystemRuntimeResult(system);
  if (result === undefined) {
    return Exit.succeed(Context.empty() as Context.Context<unknown>);
  }
  switch (result._tag) {
    case "Success":
      return Exit.succeed(result.value);
    case "Failure":
      return Exit.failCause(result.cause);
    case "Initial":
      return Exit.die(
        new Cause.NoSuchElementError("Atom runtime is not available yet")
      );
  }
};
