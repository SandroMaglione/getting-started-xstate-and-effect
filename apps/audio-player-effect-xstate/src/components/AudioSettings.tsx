import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { mutedAtom, playbackRateAtom, volumeAtom } from "../settings";
import { RenderCount, useRenderCount } from "./RenderCount";

export const AudioSettings = () => {
  const volume = useAtomValue(volumeAtom);
  const muted = useAtomValue(mutedAtom);
  const playbackRate = useAtomValue(playbackRateAtom);
  const setVolume = useAtomSet(volumeAtom);
  const setMuted = useAtomSet(mutedAtom);
  const setPlaybackRate = useAtomSet(playbackRateAtom);
  const renderCount = useRenderCount();

  return (
    <section className="settings">
      <div className="panel-header">
        <span>Settings</span>
        <RenderCount count={renderCount} />
      </div>

      <label>
        <span>Volume</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={({ currentTarget }) => {
            setVolume(currentTarget.valueAsNumber);
          }}
        />
        <strong>{Math.round(volume * 100)}%</strong>
      </label>

      <label>
        <span>Muted</span>
        <input
          type="checkbox"
          checked={muted}
          onChange={({ currentTarget }) => {
            setMuted(currentTarget.checked);
          }}
        />
      </label>

      <label>
        <span>Speed</span>
        <select
          value={playbackRate}
          onChange={({ currentTarget }) => {
            setPlaybackRate(Number(currentTarget.value));
          }}
        >
          <option value={0.75}>0.75x</option>
          <option value={1}>1x</option>
          <option value={1.25}>1.25x</option>
          <option value={1.5}>1.5x</option>
          <option value={2}>2x</option>
        </select>
      </label>
    </section>
  );
};
