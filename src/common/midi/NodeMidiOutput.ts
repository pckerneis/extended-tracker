import {MidiOutput} from './MidiOutput';

export class NodeMidiOutput implements MidiOutput {
  constructor(private readonly output: any) {
  }

  public noteOn(note: number, velocity: number, channel: number) {
    const c = Math.min(Math.max(1, channel), 16)
    this.output.sendMessage([143 + c, note, velocity]);
  }

  public noteOff(note: number, velocity: number, channel: number): void {
    const c = Math.min(Math.max(1, channel), 16)
    this.output.sendMessage([127 + c, note, velocity]);
  }

  public allSoundOff(): void {
    this.output.sendMessage([176, 120, 0]);
  }
}
