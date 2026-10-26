import { sound } from "../sound/engine";
import { useSoundSettings } from "../sound/useFactorySound";
import { SETTINGS } from "../copy";

// Mute toggle and volume. M also toggles mute.
export function SoundControl() {
  const s = useSoundSettings();
  const off = s.muted || s.volume === 0;
  return (
    <div className="hrow sound">
      <span>{SETTINGS.sound}</span>
      <button type="button" className="slotbtn" aria-pressed={!off} title={SETTINGS.mute} onClick={() => sound.set({ muted: !s.muted, volume: s.volume || 0.5 })}>
        {off ? SETTINGS.soundOff : SETTINGS.soundOn}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(s.volume * 100)}
        aria-label={SETTINGS.volume}
        onChange={(e) => sound.set({ volume: Number(e.target.value) / 100, muted: false })}
      />
    </div>
  );
}
