import { Console, Data, Effect } from "effect";
import { Context } from "./machine-types";

class OnLoadError extends Data.TaggedError("OnLoadError")<{
  context: Partial<Context>;
  message: string;
}> {}

class OnLoadSuccess extends Data.TaggedClass("OnLoadSuccess")<{
  context: Partial<Context>;
}> {}

export const onLoad = ({
  audioRef,
  context,
  trackSource,
}: {
  audioRef: HTMLAudioElement;
  context: AudioContext | null;
  trackSource: MediaElementAudioSourceNode | null;
}): Effect.Effect<never, OnLoadError, OnLoadSuccess> =>
  Effect.gen(function* (_) {
    const AudioContext =
      window.AudioContext || (window as any).webkitAudioContext || false;

    if (!AudioContext) {
      return yield* _(
        Effect.fail(
          new OnLoadError({
            context: { audioRef },
            message: "AudioContext not supported",
          })
        )
      );
    }

    const audioContext = context ?? new AudioContext();
    const audioConfig = yield* _(
      Effect.try({
        try: () => {
          const newTrackSource =
            trackSource ?? audioContext.createMediaElementSource(audioRef);

          newTrackSource.connect(audioContext.destination);

          return { trackSource: newTrackSource, audioContext } as const;
        },
        catch: () =>
          new OnLoadError({
            context: { audioRef },
            message: "Error connecting createMediaElementSource",
          }),
      })
    );

    return new OnLoadSuccess({
      context: {
        audioRef,
        audioContext: audioConfig.audioContext,
        trackSource: audioConfig.trackSource,
      },
    });
  });

export const onPlay = ({
  audioRef,
  audioContext,
}: {
  audioRef: HTMLAudioElement | null;
  audioContext: AudioContext | null;
}): Effect.Effect<never, never, void> =>
  Effect.gen(function* (_) {
    if (audioRef === null) {
      return yield* _(Effect.die("Missing audio ref" as const));
    } else if (audioContext === null) {
      return yield* _(Effect.die("Missing audio context" as const));
    }

    yield* _(Console.log(`Playing audio: ${audioRef.src}`));

    if (audioContext.state === "suspended") {
      yield* _(Effect.promise(() => audioContext.resume()));
    }

    return yield* _(Effect.promise(() => audioRef.play()));
  });

export const onPause = ({
  audioRef,
}: {
  audioRef: HTMLAudioElement | null;
}): Effect.Effect<never, never, void> =>
  Effect.gen(function* (_) {
    if (audioRef === null) {
      return yield* _(Effect.die("Missing audio ref" as const));
    }

    yield* _(Console.log(`Pausing audio at ${audioRef.currentTime}`));

    return yield* _(Effect.sync(() => audioRef.pause()));
  });

export const onRestart = ({
  audioRef,
}: {
  audioRef: HTMLAudioElement | null;
}): Effect.Effect<never, never, void> =>
  Effect.gen(function* (_) {
    if (audioRef === null) {
      return yield* _(Effect.die("Missing audio ref" as const));
    }

    yield* _(Console.log(`Restarting audio from ${audioRef.currentTime}`));

    return yield* _(
      Effect.promise(async () => {
        audioRef.currentTime = 0; // Restart

        if (audioRef.paused) {
          await audioRef.play();
        }
      })
    );
  });

export const onError = ({
  message,
}: {
  message: unknown;
}): Effect.Effect<never, never, void> =>
  Effect.sync(() =>
    console.error(`Error: ${JSON.stringify(message, null, 2)}`)
  );
