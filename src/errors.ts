import { Cause, Option } from "effect";
import type { Snapshot } from "xstate";

export type FailureSnapshot<E = unknown> = Snapshot<unknown> & {
  readonly status: "error";
  readonly cause?: Cause.Cause<E>;
  readonly error: Cause.Cause<E>;
};

export const isFailureSnapshot = <E>(
  snapshot: Snapshot<unknown>
): snapshot is FailureSnapshot<E> => snapshot.status === "error";

export const failureCause = <E>(snapshot: FailureSnapshot<E>): Cause.Cause<E> =>
  snapshot.cause ?? snapshot.error;

export const failureValue = <E>(snapshot: FailureSnapshot<E>): E | undefined =>
  Cause.findErrorOption(failureCause(snapshot)).pipe(Option.getOrUndefined);

export const prettyCause = <E>(cause: Cause.Cause<E>): string =>
  Cause.pretty(cause);
