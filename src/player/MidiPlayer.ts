import {
  Assignable,
  ControlMessage,
  InstructionKind,
  Interpreter,
  LazyExpression,
  Program,
  SequenceDeclaration,
  SequenceLike,
  SequenceOperation,
  SequenceRef,
  Step,
  TernaryInstruction
} from '../interpreter/Interpreter';
import {MidiOutput} from '../midi/MidiOutput';
import {ErrorReporter} from '../error/ErrorReporter';
import {Scheduler} from '../scheduler/Scheduler';

export interface CodeProvider {
  code: string;
}

export class MidiPlayer {

  private _program: Program;
  private _scheduler: Scheduler = new Scheduler();
  private playHead: PlayHead;
  private latestInterpretedCode: string;
  private _speed: number = 1;

  set speed(speed: number) {
    if (!isNaN(speed) && speed > 0) {
      this._speed = speed;
    } else {
      // TODO use error reporter?
      console.error('Wrong speed value ' + speed);
    }
  }

  get speed(): number {
    return this._speed;
  }

  public get scheduler(): Scheduler {
    return this._scheduler;
  }

  public get program(): Program {
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
      try {
        this.playHead = PlayHead.createAtRoot(this, 'Root', {
          onEnded: () => {
            this.output.allSoundOff();
            onEnded();
          }, onStepPlay
        }, 0.25, 0);
        this._scheduler.start();
      } catch (e) {
        this.errorReporter.reportError(e);
        onEnded();
      }
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
  private _stepDuration: number;

  private sequenceStack: { name: string, steps: Step[] }[] = [];

  public set stepDuration(stepDuration: number) {
    if (!isNaN(stepDuration) && stepDuration > 0) {
      this._stepDuration = stepDuration;
    } else {
      // TODO use error reporter?
      console.error('Wrong step duration value ' + stepDuration);
    }
  }

  public get stepDuration(): number {
    return this._stepDuration;
  }

  constructor(public readonly player: MidiPlayer, stepDuration: number, public nextStepTime: number = 0) {
    this.stepDuration = stepDuration;
  }

  public get stepsBySequenceName(): Program {
    return this.player.program;
  }

  public get scheduler(): Scheduler {
    return this.player.scheduler;
  }

  public get currentSequence(): Step[] {
    return this.sequenceStack[this.sequenceStack.length - 1]?.steps ?? [];
  }

  static createAtRoot(player: MidiPlayer, sequenceName: string, stepArguments: StepArguments, stepDuration: number, timePos: number): PlayHead {
    const playHead = new PlayHead(player, stepDuration, timePos);
    playHead.readRootSequence(sequenceName, stepArguments);
    return playHead;
  }

  static createForSequenceLike(player: MidiPlayer, sequence: SequenceLike, stepArguments: StepArguments, stepDuration: number, timePos: number, sequenceName: string): PlayHead {
    const playHead = new PlayHead(player, stepDuration, timePos);
    playHead.readSequenceLike(sequence, stepArguments, sequenceName);
    return playHead;
  }

  private readRootSequence(sequenceName: string, stepArguments: StepArguments): void {
    this.reinterpretCode();

    let instruction = this.stepsBySequenceName[sequenceName];

    if (instruction == null) {
      throw new Error('Could not find root declaration with name ' + sequenceName);
    }

    this.readSequenceLike(instruction, stepArguments, sequenceName);
  }

  private readSequenceLike(maybeSequence: Assignable, stepArguments: StepArguments, name: string): void {
    if (!maybeSequence || typeof maybeSequence !== 'object') {
      return;
    }

    if (maybeSequence.kind === InstructionKind.LazyExpression) {
      console.log('found lazy')
      this.readLazyExpression(maybeSequence, stepArguments);
    } else if (maybeSequence.kind === InstructionKind.SequenceRef) {
      this.readSequenceRef(maybeSequence, stepArguments);
    } else if (maybeSequence.kind === InstructionKind.SequenceDeclaration) {
      this.readSequenceDeclaration(name, maybeSequence, stepArguments);
    } else if (maybeSequence.kind === InstructionKind.SequenceOperation) {
      this.readSequenceOperation(maybeSequence, stepArguments, name);
    } else if (maybeSequence.kind === InstructionKind.TernaryInstruction) {
      this.readTernary(maybeSequence, stepArguments, name);
    } else {
      console.debug('Could not read as sequence', maybeSequence);
    }
  }

  private readSequenceDeclaration(name: string, maybeSequence: SequenceDeclaration, stepArguments: StepArguments) {
    const previousPosition = this.stepPositionInSequence;
    this.stepPositionInSequence = 0;
    this.pushSequence({name, steps: maybeSequence.steps});

    this.readNextStep({
      ...stepArguments,
      onEnded: () => {
        this.stepPositionInSequence = previousPosition + 1;
        this.popSequenceAndRefreshCurrent();
        this.readNextStep(stepArguments);
      }
    });
  }

  private readSequenceOperation(maybeSequence: SequenceOperation, stepArguments: StepArguments, name: string) {
    const operation = maybeSequence as SequenceOperation;
    const operationKind = maybeSequence.operation;

    switch (operationKind) {
      case 'all':
        return this.readAll(operation, stepArguments, name);
      case 'any':
        return this.readAny(operation, stepArguments, name);
      case 'left':
        return this.readLeft(operation, stepArguments);
      case 'right':
        return this.readRight(operation, stepArguments);
    }
  }

  private readAll(operation: SequenceOperation, stepArguments: StepArguments, name: string) {
    let firstEnded = false;
    let secondEnded = false;

    const leftHead = PlayHead.createForSequenceLike(this.player, operation.left, {
          ...stepArguments,
          onEnded: () => {
            firstEnded = true;

            if (secondEnded) {
              this.nextStepTime = leftHead.nextStepTime;
              this.advance(stepArguments);
            }
          },
        },
        this.stepDuration,
        this.nextStepTime,
        name);

    const rightHead = PlayHead.createForSequenceLike(this.player, operation.right, {
          ...stepArguments,
          onEnded: () => {
            secondEnded = true;

            if (firstEnded) {
              this.nextStepTime = rightHead.nextStepTime;
              this.advance(stepArguments);
            }
          },
        },
        this.stepDuration,
        this.nextStepTime,
        name);
  }

  private readAny(operation: SequenceOperation, stepArguments: StepArguments, name: string) {
    let firstEnded = false;
    let secondEnded = false;

    const leftHead = PlayHead.createForSequenceLike(this.player, operation.left, {
          ...stepArguments,
          onEnded: () => {
            firstEnded = true;

            if (!secondEnded) {
              this.nextStepTime = leftHead.nextStepTime;
              this.advance(stepArguments);
            }
          },
        },
        this.stepDuration,
        this.nextStepTime,
        name);

    const rightHead = PlayHead.createForSequenceLike(this.player, operation.right, {
          ...stepArguments,
          onEnded: () => {
            secondEnded = true;

            if (!firstEnded) {
              this.nextStepTime = rightHead.nextStepTime;
              this.advance(stepArguments);
            }
          },
        },
        this.stepDuration,
        this.nextStepTime,
        name);
  }

  private readLeft(operation: SequenceOperation, stepArguments: StepArguments) {
    const leftHead = PlayHead.createForSequenceLike(this.player, operation.left, {
          ...stepArguments,
          onEnded: () => {
            this.nextStepTime = leftHead.nextStepTime;
            this.advance(stepArguments);
          },
        },
        this.stepDuration,
        this.nextStepTime,
        '(left)');

    PlayHead.createForSequenceLike(this.player, operation.right, {
          ...stepArguments,
          onEnded: () => {
          },
        },
        this.stepDuration,
        this.nextStepTime,
        '(right)');
  }

  private readRight(operation: SequenceOperation, stepArguments: StepArguments) {
    PlayHead.createForSequenceLike(this.player, operation.left, {
          ...stepArguments,
          onEnded: () => {
          },
        },
        this.stepDuration,
        this.nextStepTime,
        '(left)');

    const rightHead = PlayHead.createForSequenceLike(this.player, operation.right, {
          ...stepArguments,
          onEnded: () => {
            this.nextStepTime = rightHead.nextStepTime;
            this.advance(stepArguments);
          },
        },
        this.stepDuration,
        this.nextStepTime,
        '(right)');
  }

  private advance(stepArguments: StepArguments) {
    this.stepPositionInSequence++;
    this.readNextStep(stepArguments);
  }

  private scheduleAdvance(stepArguments: StepArguments): void {
    this.nextStepTime += this.stepDuration / this.player.speed;
    this.scheduler.schedule(this.nextStepTime, () => this.advance(stepArguments));
  }

  private readNextStep(stepArguments: StepArguments): void {
    if (this.stepPositionInSequence >= this.currentSequence.length) {
      stepArguments.onEnded();
      return;
    }

    const step = this.currentSequence[this.stepPositionInSequence];

    // TODO add discriminator for steps and use switch
    if (step) {
      if (step.flag != null) {
        return this.advance(stepArguments);
      }

      if (step.jump != null) {
        return this.readJumpStep(step, stepArguments);
      }

      if (step.innerSequence != null) {
        return this.readInnerSequence(step, stepArguments);
      }

      if (step.controlMessage != null) {
        return this.readControlMessage(step.controlMessage, stepArguments);
      }

      this.readMessages(step, stepArguments);
    }
  }

  private readMessages(step: Step, stepArguments: StepArguments): void {
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

  private sendMessages(step: Step): number {
    let noteOnCounter = 0;

    step.messages.forEach(message => {
      let {p, v, i, c} = message.params;
      let track = this.tracks.get(i);

      if (track == null) {
        this.tracks.set(i, new Track(this.player.output));
        track = this.tracks.get(i);
      }

      if (message.silent) {
        track.silence();
      } else if (!isNaN(p) && p >= 0 && p < 128) {
        track.noteOn(p, v, c);
        noteOnCounter++;
      } else if (v != null) {
        track.velocityChange(v);
      }
    });

    return noteOnCounter;
  }

  private readInnerSequence(step: Step, stepArguments: StepArguments): void {
    this.reinterpretCode();
    this.readSequenceLike(step.innerSequence.content, stepArguments, 'inner');
  }

  private readSequenceRef(ref: SequenceRef, stepArguments: StepArguments) {
    const {sequenceName, flagName} = ref;

    if (this.stepsBySequenceName[sequenceName] != null && !isPrimitive(this.stepsBySequenceName[sequenceName])) {
      const targetSequence = this.stepsBySequenceName[sequenceName] as SequenceDeclaration;
      const previousPosition = this.stepPositionInSequence;
      this.stepPositionInSequence = 0;

      if (flagName) {
        const foundIndex = this.findFlagPosition(flagName, targetSequence.steps);
        if (foundIndex > 0) {
          this.stepPositionInSequence = foundIndex;
        }
      } else {
        this.stepPositionInSequence = 0;
      }

      this.pushSequence({name: sequenceName, steps: targetSequence.steps});

      this.readNextStep({
        ...stepArguments,
        onEnded: () => {
          this.popSequenceAndRefreshCurrent();
          this.stepPositionInSequence = previousPosition + 1;
          this.readNextStep(stepArguments);
        }
      });
    } else {
      this.advance(stepArguments);
    }
  }

  private readJumpStep(step: Step, stepArguments: StepArguments): void {
    this.reinterpretCode();
    this.refreshCurrent();

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

    this.readNextStep(stepArguments);
  }

  private readControlMessage(controlMessage: ControlMessage, stepArguments: StepArguments) {
    if (controlMessage.target === 'head') {
      Object.entries(controlMessage.params).forEach(entry => {
        if (entry[0] === 'stepDuration') {
          this.stepDuration = entry[1];
        }
      });
    } else if (controlMessage.target === 'player') {
      Object.entries(controlMessage.params).forEach(entry => {
        if (entry[0] === 'speed') {
          this.player.speed = +entry[1];
        }
      })
    }

    this.advance(stepArguments);
  }

  private readTernary(maybeSequence: TernaryInstruction, stepArguments: StepArguments, name: string) {
    const wrappedArgs = {
      ...stepArguments,
      onEnded: () => {
        this.advance(stepArguments);
      }
    }
    if (maybeSequence.condition) {
      this.readSequenceLike(maybeSequence.ifBranch, wrappedArgs, name);
    } else {
      this.readSequenceLike(maybeSequence.elseBranch, wrappedArgs, name);
    }
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

  private popSequenceAndRefreshCurrent(): void {
    this.popSequence();
    this.refreshCurrent();
  }

  private refreshCurrent(): void {
    const current = this.sequenceStack[this.sequenceStack.length - 1];

    if (current && Object.keys(this.stepsBySequenceName).includes(current.name)) {
      const maybeSequence = this.stepsBySequenceName[current.name];

      if (maybeSequence && typeof maybeSequence === 'object' && maybeSequence.kind === InstructionKind.SequenceDeclaration) {
        current.steps = maybeSequence.steps;
      }
    }
  }

  private findFlagPosition(flagName: string, steps: Step[]) {
    const flagStep = steps.find(s => s.flag?.name === flagName);
    return steps.indexOf(flagStep);
  }

  private readLazyExpression(lazyExpression: LazyExpression, stepArguments: StepArguments): void {
    console.log(lazyExpression.expr);
    this.readSequenceLike(Interpreter.evaluate(lazyExpression.expr, this.player.codeProvider.code), stepArguments, '(lazy)');
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
