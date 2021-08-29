export class MidiOutput {
  constructor(private readonly output: any) {
  }

  public noteOn(note: number, velocity: number) {
    this.output.sendMessage([144, note, velocity]);
  }

  public noteOff(note: number, velocity: number = 20): void {
    this.output.sendMessage([128, note, velocity]);
  }
}
