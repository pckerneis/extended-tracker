import {CodeProvider, Interpreter, MessageSequence, Step} from '../interpreter/Interpreter';
import {MidiOutput} from '../midi/MidiOutput';
import {ErrorReporter} from '../error/ErrorReporter';
import {Scheduler} from "../scheduler/Scheduler";

export class MidiPlayer {
  private readonly tracks: Map<number, Track> = new Map();
  private currentSequenceName: string;
  private stepPositionInSequence = 0;
  private stepsBySequenceName: MessageSequence;
  private timeStep = 0;

  private nextStepTime = 0;

  private sequenceStack: string[] = [];

  private scheduler: Scheduler = new Scheduler();

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
                     onStepPlay: StepPlayCallback,
                     errorReporter?: ErrorReporter): void {
    if (errorReporter == null) {
      errorReporter = {
        reportError: (...args: any[]) => console.error(args),
      }
    }
    const player = new MidiPlayer(codeProvider, output, errorReporter);
    player.doPlay(onEnded, onStepPlay);
  }

  private doPlay(onEnded: Function, onStepPlay: StepPlayCallback): void {
    this.reinterpretCode();

    if (this.stepsBySequenceName == null) {
      onEnded();
      return;
    }

    this.timeStep = 0;
    this.currentSequenceName = 'Program';
    this.stepPositionInSequence = 0;

    this.nextStep({onStepPlay, onEnded});

    this.scheduler.start();
  }

  private advance(stepArguments: StepArguments) {
    this.stepPositionInSequence++;
    this.nextStep(stepArguments);
  }

  private nextStep(stepArguments: StepArguments): void {
    if (this.stepPositionInSequence >= this.currentSequence.length) {
      stepArguments.onEnded();
      return;
    }

    const step = this.currentSequence[this.stepPositionInSequence];

    if (step) {
      if (step.flag != null) {
        return this.advance(stepArguments);
      }

      if (step.jump != null) {
        return this.jump(step, stepArguments);
      }

      if (step.innerSequence != null) {
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
      timeStep: this.timeStep,
      timePosition: this.nextStepTime,
      sequenceStack: this.sequenceStack,
      sequenceName: this.currentSequenceName,
      stepNumber: this.stepPositionInSequence,
      noteOnCount: noteOnCounter,
    });

    this.timeStep++;

    this.scheduleAdvance(stepArguments);
  }

  private scheduleAdvance(stepArguments: StepArguments): void {
    this.nextStepTime += 0.5;
    this.scheduler.schedule(this.nextStepTime, () => this.advance(stepArguments));
  }

  private innerSequence(step: Step, stepArguments: StepArguments): void {
    this.reinterpretCode();

    const { sequenceName, flagName } = step.innerSequence;

    if (this.stepsBySequenceName[sequenceName] != null) {
      const previousPosition = this.stepPositionInSequence;

      this.sequenceStack.push(this.currentSequenceName);
      this.currentSequenceName = sequenceName;

      if (flagName) {
        this.stepPositionInSequence = this.findFlagPosition(flagName, this.currentSequence)
      } else {
        this.stepPositionInSequence = 0;
      }

      this.nextStep({
        ...stepArguments,
        onEnded: () => {
          this.currentSequenceName = this.sequenceStack.pop();
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
        this.stepPositionInSequence = 0;
      } else {
        this.advance(stepArguments);
      }
    }

    if (step.jump.flag) {
      const jumpPosition = this.findFlagPosition(step.jump.flag, this.currentSequence);

      if (jumpPosition >= 0) {
        this.stepPositionInSequence = jumpPosition;
      }
    }

    this.nextStep(stepArguments);
  }

  private findFlagPosition(flagName: string, steps: Step[]) {
    const flagStep = steps.find(s => s.flag?.name === flagName);
    return steps.indexOf(flagStep);
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

export interface StepPlayInfo {
  timeStep: number;
  timePosition: number;
  sequenceStack: string[];
  sequenceName: string;
  stepNumber: number;
  noteOnCount: number;
}

export type StepPlayCallback = (info: StepPlayInfo) => void;

interface StepArguments {
  onStepPlay: StepPlayCallback;
  onEnded: Function
}
