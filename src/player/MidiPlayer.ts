import {CodeProvider, Interpreter, MessageSequence, Step} from '../interpreter/Interpreter';
import {MidiOutput} from '../midi/MidiOutput';
import {ErrorReporter} from '../error/ErrorReporter';

export class MidiPlayer {
  private readonly tracks: Map<number, Track> = new Map();
  private currentSequenceName: string;
  private currentSteps: Step[] = [];
  private stepPositionInSequence = 0;
  private stepsBySequenceName: MessageSequence;
  private timePosition = 0;

  private sequenceStack: string[] = [];

  public get currentSequence(): Step[] {
    return this.stepsBySequenceName[this.currentSequenceName] || [];
  }

  private constructor(private readonly codeProvider: CodeProvider,
                      private readonly output: MidiOutput,
                      private readonly errorReporter: ErrorReporter) {
  }

  public static play(codeProvider: CodeProvider,
                     output: MidiOutput,
                     onEnded: Function,
                     onStepPlay: Function,
                     errorReporter?: ErrorReporter): void {
    if (errorReporter == null) {
      errorReporter = {
        reportError: (...args: any[]) => console.error(args),
      }
    }
    const player = new MidiPlayer(codeProvider, output, errorReporter);
    player.doPlay(onEnded, onStepPlay);
  }

  private doPlay(onEnded: Function, onStepPlay: Function): void {
    this.reinterpretCode();

    if (this.stepsBySequenceName == null) {
      onEnded();
      return;
    }

    this.timePosition = 0;
    this.currentSequenceName = 'Program';
    this.currentSteps = this.stepsBySequenceName[this.currentSequenceName];
    this.stepPositionInSequence = 0;

    this.nextStep({onStepPlay, onEnded});
  }

  private advance(stepArguments: StepArguments) {
    this.stepPositionInSequence++;
    this.nextStep(stepArguments);
  }

  private nextStep(stepArguments: StepArguments): void {
    if (this.stepPositionInSequence >= this.currentSteps.length) {
      stepArguments.onEnded();
      return;
    }

    const step = this.currentSteps[this.stepPositionInSequence];

    if (step) {
      if (step.flag != null) {
        return this.advance(stepArguments);
      }

      if (step.jump != null) {
        return this.jump(step, stepArguments);
      }

      if (step.innerSequenceName != null) {
        return this.innerSequence(step, stepArguments);
      }

      this.messages(step, stepArguments);
    }
  }

  private messages(step: Step, stepArguments: StepArguments): void {
    let noteOnCounter = 0;

    if (step.messages != null) {
      noteOnCounter = this.sendMessages(step);
    }

    stepArguments.onStepPlay({
      timePosition: this.timePosition,
      sequenceStack: this.sequenceStack,
      sequenceName: this.currentSequenceName,
      stepNumber: this.stepPositionInSequence,
      noteOnCount: noteOnCounter,
    });

    this.timePosition++;

    setTimeout(() => this.advance(stepArguments), 500);
  }

  private innerSequence(step: Step, stepArguments: StepArguments): void {
    this.reinterpretCode();

    if (this.stepsBySequenceName[step.innerSequenceName] != null) {
      const previousPosition = this.stepPositionInSequence;

      this.sequenceStack.push(this.currentSequenceName);
      this.currentSequenceName = step.innerSequenceName;
      this.currentSteps = this.currentSequence;
      this.stepPositionInSequence = 0;

      this.nextStep({
        ...stepArguments,
        onEnded: () => {
          this.currentSequenceName = this.sequenceStack.pop();
          this.currentSteps = this.currentSequence;
          this.stepPositionInSequence = previousPosition + 1;

          this.nextStep(stepArguments);
        }
      });
    } else {
      this.advance(stepArguments);
    }
  }

  private jump(step: Step, stepArguments: StepArguments): void {
    this.reinterpretCode();

    if (step.jump.sequence) {
      if (this.stepsBySequenceName[step.jump.sequence] != null) {
        this.currentSequenceName = step.jump.sequence;
        this.currentSteps = this.currentSequence;
        this.stepPositionInSequence = 0;
      } else {
        this.advance(stepArguments);
      }
    }

    if (step.jump.flag) {
      const flagStep = this.currentSteps.find(s => s.flag?.name === step.jump.flag);
      const jumpPosition = this.currentSteps.indexOf(flagStep);

      if (jumpPosition >= 0) {
        this.stepPositionInSequence = jumpPosition;
      }
    }

    this.nextStep(stepArguments);
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

  private reinterpretCode(): void {
    const messageSequence = Interpreter.interpret(this.codeProvider.code, this.errorReporter);

    if (messageSequence != null) {
      this.currentSteps = messageSequence[this.currentSequenceName];
      this.stepsBySequenceName = messageSequence;
    }
  }
}

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

interface StepArguments {
  onStepPlay: Function
  onEnded: Function
}
