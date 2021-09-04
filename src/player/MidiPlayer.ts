import {
  Assignable,
  InstructionKind,
  Interpreter,
  MessageSequence,
  SequenceDeclaration,
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
      this.playHead = PlayHead.createAtRoot(this, 'Root', {onEnded, onStepPlay}, 0);
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
  private stepPositionInSequence = 0;
  private timeStep = 0;

  private stepDuration = 0.27;

  private sequenceStack: { name: string, steps: Step[] }[] = [];

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

  static createAtRoot(player: MidiPlayer, sequenceName: string, stepArguments: StepArguments, timePos: number): PlayHead {
    const playHead = new PlayHead(player, timePos);
    playHead.readRootSequence(sequenceName, stepArguments);
    return playHead;
  }

  static createForSequence(player: MidiPlayer, sequence: SequenceDeclaration | SequenceOperation | string, stepArguments: StepArguments, timePos: number, sequenceName: string): PlayHead {
    const playHead = new PlayHead(player, timePos);
    playHead.readSequenceOrOperation(sequence, stepArguments, sequenceName);
    return playHead;
  }

  private readRootSequence(sequenceName: string, stepArguments: StepArguments): void {
    this.reinterpretCode();

    let instruction = this.stepsBySequenceName[sequenceName];

    if (instruction == null) {
      throw new Error('Could not find root declaration with name ' + sequenceName);
    }

    this.readSequenceOrOperation(instruction, stepArguments, sequenceName);
  }

  private readSequenceOrOperation(maybeSequence: Assignable, stepArguments: StepArguments, name: string): void {
    if (!maybeSequence || typeof maybeSequence !== 'object') {
      return;
    }

    if (maybeSequence.kind === InstructionKind.SequenceDeclaration) {
      const previousPosition = this.stepPositionInSequence;
      this.stepPositionInSequence = 0;
      this.pushSequence({name, steps: maybeSequence.steps});

      this.nextStep({
        ...stepArguments,
        onEnded: () => {
          this.stepPositionInSequence = previousPosition + 1;
          this.popSequence();
          this.nextStep(stepArguments);
        }
      });
    } else if (maybeSequence.kind === InstructionKind.SequenceOperation) {
      this.readSequenceOperation(maybeSequence, stepArguments, name);
    }
  }

  private readSequenceOperation(maybeSequence: SequenceOperation, stepArguments: StepArguments, name: string) {
    const operation = maybeSequence as SequenceOperation;
    const operationKind = maybeSequence.operation;

    if (operationKind == 'all') {
      this.readAll(operation, stepArguments, name);
    } else if (operationKind == 'any') {
      this.readAny(operation, stepArguments, name);
    }
  }

  private readAll(operation: SequenceOperation, stepArguments: StepArguments, name: string) {
    let firstEnded = false;
    let secondEnded = false;

    const leftHead = PlayHead.createForSequence(this.player, operation.left, {
          ...stepArguments,
          onEnded: () => {
            firstEnded = true;

            if (secondEnded) {
              this.nextStepTime = leftHead.nextStepTime;
              this.advance(stepArguments);
            }
          },
        },
        this.nextStepTime,
        name);

    const rightHead = PlayHead.createForSequence(this.player, operation.right, {
          ...stepArguments,
          onEnded: () => {
            secondEnded = true;

            if (firstEnded) {
              this.nextStepTime = rightHead.nextStepTime;
              this.advance(stepArguments);
            }
          },
        },
        this.nextStepTime,
        name);
  }

  private readAny(operation: SequenceOperation, stepArguments: StepArguments, name: string) {
    let firstEnded = false;
    let secondEnded = false;

    const leftHead = PlayHead.createForSequence(this.player, operation.left, {
          ...stepArguments,
          onEnded: () => {
            firstEnded = true;

            if (!secondEnded) {
              this.nextStepTime = leftHead.nextStepTime;
              this.advance(stepArguments);
            }
          },
        },
        this.nextStepTime,
        name);

    const rightHead = PlayHead.createForSequence(this.player, operation.right, {
          ...stepArguments,
          onEnded: () => {
            secondEnded = true;

            if (!firstEnded) {
              this.nextStepTime = rightHead.nextStepTime;
              this.advance(stepArguments);
            }
          },
        },
        this.nextStepTime,
        name);
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
        const steps = this.stepsBySequenceName[sequenceName] as SequenceDeclaration;
        const previousPosition = this.stepPositionInSequence;

        if (flagName) {
          this.stepPositionInSequence = this.findFlagPosition(flagName, this.currentSequence)
        } else {
          this.stepPositionInSequence = 0;
        }

        this.pushSequence({name: sequenceName, steps: steps.steps});

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
      this.readSequenceOrOperation(step.innerSequence.content, stepArguments, '(op)');
    }
  }

  private jump(step: Step, stepArguments: StepArguments): void {
    this.reinterpretCode();

    if (step.jump.sequence) {
      if (this.stepsBySequenceName[step.jump.sequence] != null) {
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

  private pushSequence(namedSequence: { name: string, steps: Step[] }): void {
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
  stepNumber: number;
  noteOnCount: number;
}

export type StepPlayCallback = (info: StepPlayInfo) => void;

interface StepArguments {
  onStepPlay: StepPlayCallback;
  onEnded: Function
}
