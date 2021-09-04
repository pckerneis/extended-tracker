import {
  Assignable,
  InstructionKind,
  Interpreter,
  MessageSequence,
  SequenceDeclaration,
  SequenceLike,
  SequenceOperation,
  Step
} from '../interpreter/Interpreter';
import {MidiOutput} from '../midi/MidiOutput';
import {ErrorReporter} from '../error/ErrorReporter';
import {Scheduler} from "../scheduler/Scheduler";


export interface CodeProvider {
  code: string;
}

export class MidiPlayer {

  private _program: MessageSequence;
  private _scheduler: Scheduler = new Scheduler();
  private playHead: PlayHead;
  private latestInterpretedCode: string;

  public get scheduler(): Scheduler {
    return this._scheduler;
  }

  public get program(): MessageSequence {
    return this._program;
  }

  private constructor(public readonly codeProvider: CodeProvider,
                      public readonly output: MidiOutput,
                      public readonly errorReporter: ErrorReporter) {
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

    if (this.latestInterpretedCode) {
      this.playHead = PlayHead.createAtRoot(this, 'Root', {onEnded, onStepPlay});
      this._scheduler.start();
    } else {
      onEnded();
    }
  }

  public reinterpretCode(): void {
    const code = this.codeProvider.code;

    if (code !== this.latestInterpretedCode) {
      const newProgram = Interpreter.interpret(this.codeProvider.code, this.errorReporter);

      if (newProgram != null) {
        console.log('Program interpreted')
        this._program = newProgram;
        this.latestInterpretedCode = code;
      } else {
        console.error('Program could not be interpreted.');
      }
    }
  }
}

function isPrimitive(thing: any) {
  return ['number', 'boolean', 'string'].includes(typeof thing);
}

class PlayHead {

  private readonly tracks: Map<number, Track> = new Map();
  private currentSequenceName: string;
  private stepPositionInSequence = 0;
  private timeStep = 0;

  private stepDuration = 0.27;

  private sequenceStack: { name: string, steps: Step[] }[] = [];

  private readonly childrenPlayHeads: PlayHead[] = [];

  constructor(public readonly player: MidiPlayer, public nextStepTime: number = 0) {
  }

  public get stepsBySequenceName(): MessageSequence {
    return this.player.program;
  }

  public get scheduler(): Scheduler {
    return this.player.scheduler;
  }

  public get currentSequence(): Step[] {
    return this.sequenceStack[this.sequenceStack.length - 1]?.steps ?? [];
  }

  static createAtRoot(player: MidiPlayer, sequenceName: string, stepArguments: StepArguments): PlayHead {
    const playHead = new PlayHead(player);
    playHead.readRootSequence(sequenceName, stepArguments);
    return playHead;
  }

  static createForSequence(player: MidiPlayer, sequence: SequenceDeclaration | SequenceOperation | string, stepArguments: StepArguments, timePos: number, sequenceName: string): PlayHead {
    const playHead = new PlayHead(player, timePos);
    playHead.reinterpretCode();
    playHead.pushSequence(playHead.readSequenceOrOperation(sequence, stepArguments, sequenceName));
    playHead.nextStep(stepArguments);
    return playHead;
  }

  private readRootSequence(sequenceName: string, stepArguments: StepArguments): void {
    this.reinterpretCode();

    let instruction = this.stepsBySequenceName[sequenceName];

    if (instruction == null) {
      throw new Error('Could not find root declaration with name ' + sequenceName);
    }

    this.pushSequence(this.readSequenceOrOperation(instruction, stepArguments, sequenceName));
    this.currentSequenceName = sequenceName;

    this.nextStep(stepArguments);
  }

  private readSequenceOrOperation(maybeSequence: Assignable, stepArguments: StepArguments, name: string): {steps: Step[], name: string} {
    while (maybeSequence && typeof maybeSequence === 'object' && maybeSequence?.kind === InstructionKind.SequenceOperation) {
      const operation = maybeSequence as SequenceOperation;
      maybeSequence = operation.left;
      // TODO never released
      this.childrenPlayHeads.push(PlayHead.createForSequence(this.player, operation.right, {
            ...stepArguments,
            onEnded: () => {
              // TODO
            },
          },
          this.nextStepTime,
          name));
    }

    if (typeof maybeSequence === 'object' && maybeSequence.kind === InstructionKind.SequenceDeclaration) {
      this.currentSequenceName = 'anonymous';
      return {name, steps: maybeSequence.steps};
    }

    console.log('bbouu')
    return {name: '', steps:[]};
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
      sequenceStack: this.sequenceStack.map(stack => stack.name),
      sequenceName: this.currentSequenceName,
      // sequenceName: '',
      stepNumber: this.stepPositionInSequence,
      noteOnCount: noteOnCounter,
    });

    this.timeStep++;

    this.scheduleAdvance(stepArguments);
  }

  private scheduleAdvance(stepArguments: StepArguments): void {
    this.nextStepTime += this.stepDuration;
    this.scheduler.schedule(this.nextStepTime, () => this.advance(stepArguments));
  }

  private innerSequence(step: Step, stepArguments: StepArguments): void {
    this.reinterpretCode();

    if (step.innerSequence.content.kind === InstructionKind.SequenceRef) {

      const {sequenceName, flagName} = step.innerSequence.content;

      if (this.stepsBySequenceName[sequenceName] != null && !isPrimitive(this.stepsBySequenceName[sequenceName])) {
        const steps = this.readSequenceOrOperation(this.stepsBySequenceName[sequenceName] as SequenceLike, stepArguments, sequenceName);

        const previousPosition = this.stepPositionInSequence;
        this.currentSequenceName = sequenceName;

        if (flagName) {
          this.stepPositionInSequence = this.findFlagPosition(flagName, this.currentSequence)
        } else {
          this.stepPositionInSequence = 0;
        }

        this.pushSequence(steps);

        this.nextStep({
          ...stepArguments,
          onEnded: () => {
            this.popSequence();
            this.stepPositionInSequence = previousPosition + 1;
            this.nextStep(stepArguments);
          }
        });
      } else {
        this.advance(stepArguments);
      }
    } else if (step.innerSequence.content.kind === InstructionKind.SequenceOperation) {
      this.pushSequence(this.readSequenceOrOperation(step.innerSequence.content, stepArguments, '(op)'));

      const previousPosition = this.stepPositionInSequence;
      this.stepPositionInSequence = 0;

      this.nextStep({
        ...stepArguments,
        onEnded: () => {
          this.stepPositionInSequence = previousPosition + 1;
          this.popSequence();
          this.nextStep(stepArguments);
        }
      });
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
        return;
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
        this.tracks.set(i, new Track(this.player.output));
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
    this.player.reinterpretCode();
  }

  private pushSequence(namedSequence: {name: string, steps: Step[]}): void {
    this.sequenceStack.push(namedSequence);
  }

  private popSequence(): void {
    this.sequenceStack.pop();
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
