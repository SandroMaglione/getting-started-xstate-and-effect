import { Audio } from "./components/Audio";
import { AudioSettings } from "./components/AudioSettings";
import { Controls } from "./components/Controls";
import { CurrentTime } from "./components/CurrentTime";
import { LoudnessMeter } from "./components/LoudnessMeter";
import { StatePreview } from "./components/StatePreview";

export default function App() {
  return (
    <main>
      <StatePreview />
      <Audio />
      <CurrentTime />
      <LoudnessMeter />
      <AudioSettings />
      <Controls />
    </main>
  );
}
