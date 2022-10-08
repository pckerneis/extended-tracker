import {MidiOutput} from './MidiOutput';

export class WebSocketMidiOutput implements MidiOutput {
  constructor(private readonly connection: WebSocket) {
  }

  public noteOn(note: number, velocity: number, channel: number) {
    const c = Math.min(Math.max(1, channel), 16);

    this.send({
      kind: MessageKind.NOTE_ON,
      pitch: note,
      velocity,
      channel: c,
    });
  }

  public noteOff(note: number, velocity: number, channel: number): void {
    const c = Math.min(Math.max(1, channel), 16);

    this.send({
      kind: MessageKind.NOTE_OFF,
      pitch: note,
      velocity,
      channel: c,
    });
  }

  public allSoundOff(): void {
    this.send({
      kind: MessageKind.ALL_SOUND_OFF,
    });
  }

  private send(message: WebSocketMidiMessage): void {
    this.connection.send(JSON.stringify(message));
  }
}

enum MessageKind {
  NOTE_ON = 'NOTE_ON',
  NOTE_OFF = 'NOTE_OFF',
  ALL_SOUND_OFF = 'ALL_SOUND_OFF',
}

interface WebSocketMidiMessage {
  kind: MessageKind;
  pitch?: number;
  velocity?: number;
  channel?: number;
}
