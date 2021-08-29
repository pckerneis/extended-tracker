import {CodeProvider, Interpreter} from '../interpreter/Interpreter';
import {MidiOutput} from '../midi/MidiOutput';
import {ErrorReporter} from '../error/ErrorReporter';

class Track {
  private latestVelocity = 0;
  private _latestPitch: number;

  constructor(public readonly output: MidiOutput) {

  }

  noteOn(pitch: number, velocity?: number) {
    this.endPendingNote();

    if (velocity != null) {
      velocity = Math.min(Math.max(0, velocity), 127);
      this.latestVelocity = velocity;
    } else {
      velocity = this.latestVelocity;
    }

    this.output.noteOn(pitch, velocity);
    this._latestPitch = pitch;
  }

  silence() {
    this.endPendingNote();
  }

  velocityChange(velocity: number) {
    if (! isNaN(velocity)) {
      velocity = Math.min(Math.max(0, velocity), 127);
      this.latestVelocity = velocity;
    }
  }

  private endPendingNote(): void {
    if (this._latestPitch != null) {
      this.output.noteOff(this._latestPitch);
      this._latestPitch = null;
    }
  }
}

export class MidiPlayer {

  private tracks: Map<number, Track> = new Map();

  private constructor(private readonly output: MidiOutput,
                      private readonly errorReporter: ErrorReporter) {
  }

  public static play(codeSource: CodeProvider,
                     output: MidiOutput,
                     onEnded: Function,
                     onStepPlay: Function,
                     errorReporter?: ErrorReporter): void {
    if (errorReporter == null) {
      errorReporter = {
        reportError: (...args: any[]) => console.error(args),
      }
    }
    const player = new MidiPlayer(output, errorReporter);
    player.doPlay(codeSource, onEnded, onStepPlay);
  }

  private doPlay(codeSource: CodeProvider, onEnded: Function, onStepPlay: Function): void {
    const result = Interpreter.interpret(codeSource.code, this.errorReporter);

    if (result == null) {
      onEnded();
      return;
    }

    let steps = result.steps;
    let position = 0;

    const handler = () => {
      const step = steps[position];

      if (step) {
        if (step.flag != null) {
          position++;
          handler();
          return;
        }

        if (step.jump != null) {
          const messageSequence = Interpreter.interpret(codeSource.code, this.errorReporter);

          if (messageSequence != null) {
            steps = messageSequence.steps;
          }

          const jumpStep = steps.find(s => s.flag?.name === step.jump.name);
          const jumpPosition = steps.indexOf(jumpStep);

          if (jumpPosition >= 0) {
            position = jumpPosition;
            handler();
            return;
          }
          handler();
        }

        let noteOnCounter = 0;

        if (step.messages != null) {
          step.messages.forEach(message => {
            let {p, v, i} = message.params;
            let track = this.tracks.get(i);

            if (track == null) {
              this.tracks.set(i, new Track(this.output));
              track = this.tracks.get(i);
            }

            if (message.silent) {
              track.silence();
            } else if (!isNaN(p) && p >= 0 && p < 128) {
              track.noteOn(p, v);
              noteOnCounter++;
            } else if (v != null) {
              track.velocityChange(v);
            }
          });
        }

        onStepPlay({
          sequenceName: 'Program',  // TODO
          stepNumber: position,
          noteOnCount: noteOnCounter,
        });
      }

      position++;

      if (position < steps.length) {
        setTimeout(handler, 500);
      } else {
        onEnded();
      }
    };

    handler();
  }
}
