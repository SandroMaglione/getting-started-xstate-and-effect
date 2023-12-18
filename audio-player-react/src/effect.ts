import { Data, Effect } from "effect";
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
