import {MidiOutput} from '../midi/MidiOutput';
import {BasePlayer, defaultClock} from './Player';

export interface CodeProvider {
  code: string;
}

export class MidiPlayer extends BasePlayer {
  private heads = new Map<string, Track[]>();

  constructor(codeProvider: CodeProvider,
              clock: () => number,
              public readonly output: MidiOutput) {
    super(codeProvider, clock);
  }

  public static read(codeProvider: CodeProvider,
                     entryPoint: string,
                     output: MidiOutput,
                     clock: () => number = defaultClock): void {
    const player = new MidiPlayer(codeProvider, clock, output);
    player.start(entryPoint,
      { post: (t, head, messages) => player.processMessages(t, head, messages) },
      () => console.log('Ended'));
  }

  private processMessages(time: number, headId: string, messages: any[]) {
    let tracks: Track[] = this.heads.get(headId);

    if (tracks == null) {
      tracks = [];
      this.heads.set(headId, tracks);
    }

    messages.forEach((message, index) => {
      let {p, v, i, c} = message;

      const trackIndex = i ?? index;
      let track: Track = tracks[trackIndex];

      if (track == null) {
        track = new Track(this.output);
        tracks[trackIndex] = track;
      }

      if (message.silent) {
        track.silence();
      } else if (!isNaN(p) && p >= 0 && p < 128) {
        track.noteOn(p, v, c);
      } else if (v != null) {
        track.velocityChange(v);
      }
    });
  }
}

class Track {
  private _latestVelocity = 0;
  private _pendingPitch: number;
  private _pendingChannel: number;
  private _latestChannel: number;

  constructor(public readonly output: MidiOutput) {
  }

  noteOn(pitch: number, velocity?: number, channel?: number) {
    this.endPendingNote();

    if (velocity != null) {
      velocity = Math.min(Math.max(0, velocity), 127);
      this._latestVelocity = velocity;
    } else {
      velocity = this._latestVelocity;
    }

    channel = channel ?? this._latestChannel ?? 0;

    this.output.noteOn(pitch, velocity, channel);
    this._pendingPitch = pitch;
    this._pendingChannel = channel;
    this._latestChannel = channel;
  }

  silence() {
    this.endPendingNote();
  }

  velocityChange(velocity: number) {
    if (!isNaN(velocity)) {
      velocity = Math.min(Math.max(0, velocity), 127);
      this._latestVelocity = velocity;
    }
  }

  private endPendingNote(): void {
    if (this._pendingPitch != null) {
      this.output.noteOff(this._pendingPitch, 0, this._pendingChannel);
      this._pendingPitch = null;
      this._pendingChannel = null;
    }
  }
}
