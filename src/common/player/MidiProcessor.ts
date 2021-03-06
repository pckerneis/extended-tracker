import {MidiOutput} from '../midi/MidiOutput';
import {ClockFunction, MessageProcessor, Player} from './Player';
import {EventQueue} from '../events/EventQueue';

export class MidiProcessor implements MessageProcessor {
  player?: Player;

  private readonly heads = new Map<string, Track[]>();

  private readonly _eventQueue: EventQueue<Function> = new EventQueue<Function>();

  constructor(public readonly output: MidiOutput, public readonly clock: ClockFunction) {
  }

  private run() {
    if (this.player.stopped && this._eventQueue.isEmpty()) {
      return;
    }

    const now = this.clock() - this.player.startTime;

    let next: Function;

    do {
      next = this._eventQueue.next(now)?.event;

      if (next) {
        next();
      }
    } while (next);

    setTimeout(() => this.run(), 0);
  }

  public started(): void {
    this.run();
  }

  public process(time: number, headId: string, messages: any[]) {
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

      this._eventQueue.add(time, () => {
        if (message.hasOwnProperty('-')) {
          track.silence();
        } else if (!isNaN(p) && p >= 0 && p < 128) {
          track.noteOn(p, v, c);
        } else if (v != null) {
          track.velocityChange(v);
        }
      });
    });
  }

  public ended(): void {
    this.silenceAndReset();
  }

  public stopped(): void {
    this.silenceAndReset();
  }

  headEnded(headId: string): void {
    const tracks: Track[] = this.heads.get(headId);
    if (tracks) {
      tracks.forEach(track => track.silence());
      this.heads.set(headId, null);
    }
  }

  private silenceAndReset(): void {
    this._eventQueue.clear();
    this.heads.forEach((tracks) => tracks?.forEach(track => track.silence()));
    this.output.allSoundOff();
    this.heads.clear();
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
