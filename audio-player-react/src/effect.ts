import { Data, Effect } from "effect";

class AudioContextNotSupported extends Data.TaggedError(
  "AudioContextNotSupported"
)<{}> {}

class LoadingAudioTrackError extends Data.TaggedError(
  "LoadingAudioTrackError"
)<{ error: unknown }> {}

export const loadAudio = ({
  audioRef,
  context,
  trackSource,
}: {
  audioRef: HTMLAudioElement;
  context: AudioContext | null;
  trackSource: MediaElementAudioSourceNode | null;
}) =>
  Effect.gen(function* (_) {
    const AudioContext =
      window.AudioContext || (window as any).webkitAudioContext || false;

    if (!AudioContext) {
      return yield* _(Effect.fail(new AudioContextNotSupported()));
    }

    const audioContext = context ?? new AudioContext();
    return yield* _(
      Effect.try({
        try: () => {
          const newTrackSource =
            trackSource ?? audioContext.createMediaElementSource(audioRef);

          newTrackSource.connect(audioContext.destination);

          return { trackSource: newTrackSource, audioContext } as const;
        },
        catch: (error) => new LoadingAudioTrackError({ error }),
      })
    );
  });
