import { useAtomValue } from "@effect/atom-react";
import { loudnessAtom } from "../atoms";
import { RenderCount, useRenderCount } from "./RenderCount";

export const LoudnessMeter = () => {
  const loudness = useAtomValue(loudnessAtom);
  const renderCount = useRenderCount();
  const level = Math.round((loudness?.rms ?? 0) * 100);
  const peak = Math.round((loudness?.peak ?? 0) * 100);
  const decibels = loudness?.decibels.toFixed(1) ?? "-80.0";

  return (
    <section className="meter">
      <div className="meter-header">
        <span>Loudness</span>
        <div className="meter-values">
          <RenderCount count={renderCount} />
          <strong>{decibels} dB</strong>
        </div>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${level}%` }} />
      </div>
      <p>{`RMS ${level}% · Peak ${peak}%`}</p>
    </section>
  );
};
