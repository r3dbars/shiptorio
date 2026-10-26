import { sound } from "../sound/engine";
import { useSoundSettings } from "../sound/useFactorySound";

// Mute toggle, music toggle and volume. M also toggles mute.
export function SoundControl() {
  const s = useSoundSettings();
  const off = s.muted || s.volume === 0;
  return (
    <div className="hrow sound">
      <span>SOUND</span>
      <button type="button" className="slotbtn" aria-pressed={!off} title="Mute (M)" onClick={() => sound.set({ muted: !s.muted, volume: s.volume || 0.5 })}>
        {off ? "OFF" : "ON"}
      </button>
      <button type="button" className="slotbtn" aria-pressed={s.music} title="Music" onClick={() => sound.set({ music: !s.music })}>
        {s.music ? "♪ ON" : "♪ OFF"}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(s.volume * 100)}
        aria-label="Volume"
        onChange={(e) => sound.set({ volume: Number(e.target.value) / 100, muted: false })}
      />
    </div>
  );
}
