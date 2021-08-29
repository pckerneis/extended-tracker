export class MidiOutput {
  constructor(private readonly output: any) {
  }

  public noteOn(note: number, velocity: number) {
    this.output.sendMessage([144, note, velocity]);
  }
}
