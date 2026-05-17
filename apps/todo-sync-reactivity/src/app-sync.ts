import { Context, Effect, Layer, Stream } from "effect";
import { Reactivity } from "effect/unstable/reactivity";

export type SyncTopic = "todos";

const syncKey = (topic: SyncTopic) => [`app-sync:${topic}`] as const;

/// 👇 AppSync speaks in domain topics and hides Effect Reactivity keys.
export class AppSync extends Context.Service<AppSync>()("AppSync", {
  make: Effect.gen(function* () {
    const reactivity = yield* Reactivity.Reactivity;

    return {
      invalidate: (topic: SyncTopic) => reactivity.invalidate(syncKey(topic)),
      listen: (topic: SyncTopic, onInvalidate: () => void) =>
        reactivity.stream(syncKey(topic), Effect.void).pipe(
          /// 👇 The stream emits once when it starts; readers skip that seed.
          Stream.drop(1),
          Stream.runForEach(() => Effect.sync(onInvalidate)),
        ),
    };
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make).pipe(
    Layer.provide(Reactivity.layer),
  );
}
