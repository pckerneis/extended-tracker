export interface MidiOutput {
  noteOn(note: number, velocity: number, channel: number): void;
  noteOff(note: number, velocity: number, channel: number): void;
  allSoundOff(): void;
}
