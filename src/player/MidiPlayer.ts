import {CodeProvider, Interpreter, MessageSequence, Step} from '../interpreter/Interpreter';
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
    if (!isNaN(velocity)) {
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
  private readonly tracks: Map<number, Track> = new Map();
  private currentSequenceName: string;
  private currentSteps: Step[] = [];
  private position = 0;

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
    const stepsBySequenceName = Interpreter.interpret(codeSource.code, this.errorReporter);

    if (stepsBySequenceName == null) {
      onEnded();
      return;
    }

    this.currentSequenceName = 'Program';
    this.currentSteps = stepsBySequenceName[this.currentSequenceName];
    this.position = 0;

    const handler = () => {
      this.nextStep(codeSource, stepsBySequenceName, onStepPlay, onEnded);
    };

    handler();
  }

  private nextStep(codeSource: CodeProvider, stepsBySequenceName: MessageSequence, onStepPlay: Function, onEnded: Function): void {
    if (this.position >= this.currentSteps.length) {
      onEnded();
      return;
    }

    const step = this.currentSteps[this.position];

    if (step) {
      if (step.flag != null) {
        this.position++;
        this.nextStep(codeSource, stepsBySequenceName, onStepPlay, onEnded);
        return;
      }

      if (step.jump != null) {
        const messageSequence = Interpreter.interpret(codeSource.code, this.errorReporter);

        if (messageSequence != null) {
          this.currentSteps = messageSequence[this.currentSequenceName];
          stepsBySequenceName = messageSequence;
        }

        const jumpStep = this.currentSteps.find(s => s.flag?.name === step.jump.name);
        const jumpPosition = this.currentSteps.indexOf(jumpStep);

        if (jumpPosition >= 0) {
          this.position = jumpPosition;
          this.nextStep(codeSource, stepsBySequenceName, onStepPlay, onEnded);
          return;
        }

        this.nextStep(codeSource, stepsBySequenceName, onStepPlay, onEnded);
        return;
      }

      if (step.innerSequenceName != null) {
        const messageSequence = Interpreter.interpret(codeSource.code, this.errorReporter);

        if (messageSequence != null) {
          this.currentSteps = messageSequence[this.currentSequenceName];
          stepsBySequenceName = messageSequence;
        }

        if (stepsBySequenceName[step.innerSequenceName] != null) {
          const previousPosition = this.position;
          const previousSequenceName = this.currentSequenceName;

          this.currentSequenceName = step.innerSequenceName;
          this.currentSteps = stepsBySequenceName[step.innerSequenceName] as Step[];
          this.position = 0;

          this.nextStep(codeSource, stepsBySequenceName, onStepPlay, () => {
            this.currentSequenceName = previousSequenceName;
            this.currentSteps = stepsBySequenceName[this.currentSequenceName] as Step[];
            this.position = previousPosition + 1;

            this.nextStep(codeSource, stepsBySequenceName, onStepPlay, onEnded);
            return;
          });

          return;
        }

        this.nextStep(codeSource, stepsBySequenceName, onStepPlay, onEnded);
        return;
      }

      let noteOnCounter = 0;

      if (step.messages != null) {
        noteOnCounter = this.sendMessages(step);
      }

      onStepPlay({
        sequenceName: this.currentSequenceName,
        stepNumber: this.position,
        noteOnCount: noteOnCounter,
      });
    }

    this.position++;

    if (this.position < this.currentSteps.length) {
      setTimeout(() => this.nextStep(codeSource, stepsBySequenceName, onStepPlay, onEnded), 500);
    } else {
      setTimeout(() => onEnded(), 500);
    }
  }

  private sendMessages(step: Step): number {
    let noteOnCounter = 0;

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

    return noteOnCounter;
  }
}
