// import {
//   Assignable, ControlMessage,
//   Declaration,
//   InstructionKind, Interpreter, LazyExpression, ParametrizedSequence,
//   Program,
//   SequenceDeclaration,
//   SequenceLike, SequenceOperation, SequenceRef,
//   Step, TernaryInstruction
// } from '../interpreter/Interpreter';
// import {Expr} from '../parser/Ast';
// import {Scheduler} from '../scheduler/Scheduler';
// import {MidiPlayer} from './MidiPlayer';
// import {MidiOutput} from '../midi/MidiOutput';
//
//
// export class PlayHead {
//
//   private readonly tracks: Map<number, Track> = new Map();
//   private stepPositionInSequence = 0;
//   private timeStep = 0;
//   private _stepDuration: number;
//
//   private sequenceStack: { name: string, steps: Step[] }[] = [];
//   private context: Expr[];
//
//   public set stepDuration(stepDuration: number) {
//     if (!isNaN(stepDuration) && stepDuration > 0) {
//       this._stepDuration = stepDuration;
//     } else {
//       // TODO use error reporter?
//       console.error('Wrong step duration value ' + stepDuration);
//     }
//   }
//
//   public get stepDuration(): number {
//     return this._stepDuration;
//   }
//
//   constructor(public readonly player: MidiPlayer, stepDuration: number, public nextStepTime: number = 0) {
//     this.stepDuration = stepDuration;
//   }
//
//   static createAtRoot(player: MidiPlayer, sequenceName: string, stepArguments: StepArguments, stepDuration: number, timePos: number): PlayHead {
//     const playHead = new PlayHead(player, stepDuration, timePos);
//     playHead.readRootSequence(sequenceName, stepArguments);
//     return playHead;
//   }
//
//   static createForSequenceLike(player: MidiPlayer, sequence: SequenceLike, stepArguments: StepArguments, stepDuration: number, timePos: number, sequenceName: string): PlayHead {
//     const playHead = new PlayHead(player, stepDuration, timePos);
//     playHead.readSequenceLike(sequence, stepArguments, sequenceName);
//     return playHead;
//   }
//
//   public get program(): Program {
//     return this.player.program;
//   }
//
//   public get scheduler(): Scheduler {
//     return this.player.scheduler;
//   }
//
//   public get currentSequence(): Step[] {
//     return this.sequenceStack[this.sequenceStack.length - 1]?.steps ?? [];
//   }
//
//   private findDeclaration(name: string): Declaration {
//     return this.program.declarations.find(d => d.name === name);
//   }
//
//   private readRootSequence(sequenceName: string, stepArguments: StepArguments): void {
//     this.reinterpretCode();
//
//     let declaration = this.findDeclaration(sequenceName);
//
//     if (declaration == null) {
//       throw new Error('Could not find root declaration with name ' + sequenceName);
//     }
//
//     this.readSequenceLike(declaration.value, stepArguments, sequenceName);
//   }
//
//   private readSequenceLike(maybeSequence: Assignable, stepArguments: StepArguments, name: string): void {
//     if (!maybeSequence || typeof maybeSequence !== 'object') {
//       return;
//     }
//
//     // TODO use switch..
//     if (maybeSequence.kind === InstructionKind.ParametrizedSequence) {
//       this.readParametrizedSequence(name, maybeSequence, stepArguments);
//     } else if (maybeSequence.kind === InstructionKind.LazyExpression) {
//       this.readLazyExpression(maybeSequence, stepArguments, this.context);
//     } else if (maybeSequence.kind === InstructionKind.SequenceRef) {
//       this.readSequenceRef(maybeSequence, stepArguments);
//     } else if (maybeSequence.kind === InstructionKind.SequenceDeclaration) {
//       this.readSequenceDeclaration(name, maybeSequence, stepArguments);
//     } else if (maybeSequence.kind === InstructionKind.SequenceOperation) {
//       this.readSequenceOperation(maybeSequence, stepArguments, name);
//     } else if (maybeSequence.kind === InstructionKind.TernaryInstruction) {
//       this.readTernary(maybeSequence, stepArguments, name);
//     } else {
//       console.debug('Could not read as sequence', maybeSequence);
//     }
//   }
//
//   private readSequenceDeclaration(name: string, maybeSequence: SequenceDeclaration, stepArguments: StepArguments) {
//     const previousPosition = this.stepPositionInSequence;
//     this.stepPositionInSequence = 0;
//     this.pushSequence({name, steps: maybeSequence.steps});
//
//     this.readNextStep({
//       ...stepArguments,
//       onEnded: () => {
//         this.stepPositionInSequence = previousPosition + 1;
//         this.popSequenceAndRefreshCurrent();
//         this.readNextStep(stepArguments);
//       }
//     });
//   }
//
//   private readParametrizedSequence(name: string, parametrizedSequence: ParametrizedSequence, stepArguments: StepArguments): void {
//     this.context = parametrizedSequence.call.args;
//
//     const previousPosition = this.stepPositionInSequence;
//     this.stepPositionInSequence = 0;
//     this.pushSequence({name, steps: parametrizedSequence.callee.steps});
//
//     this.readNextStep({
//       ...stepArguments,
//       onEnded: () => {
//         this.context = null;
//         this.stepPositionInSequence = previousPosition + 1;
//         this.popSequenceAndRefreshCurrent();
//         this.readNextStep(stepArguments);
//       }
//     });
//   }
//
//   private readSequenceOperation(maybeSequence: SequenceOperation, stepArguments: StepArguments, name: string) {
//     const operation = maybeSequence as SequenceOperation;
//     const operationKind = maybeSequence.operation;
//
//     switch (operationKind) {
//       case 'all':
//         return this.readAll(operation, stepArguments, name);
//       case 'any':
//         return this.readAny(operation, stepArguments, name);
//       case 'left':
//         return this.readLeft(operation, stepArguments);
//       case 'right':
//         return this.readRight(operation, stepArguments);
//     }
//   }
//
//   private readAll(operation: SequenceOperation, stepArguments: StepArguments, name: string) {
//     let firstEnded = false;
//     let secondEnded = false;
//
//     const leftHead = PlayHead.createForSequenceLike(this.player, operation.left, {
//         ...stepArguments,
//         onEnded: () => {
//           firstEnded = true;
//
//           if (secondEnded) {
//             this.nextStepTime = leftHead.nextStepTime;
//             this.advance(stepArguments);
//           }
//         },
//       },
//       this.stepDuration,
//       this.nextStepTime,
//       name);
//
//     const rightHead = PlayHead.createForSequenceLike(this.player, operation.right, {
//         ...stepArguments,
//         onEnded: () => {
//           secondEnded = true;
//
//           if (firstEnded) {
//             this.nextStepTime = rightHead.nextStepTime;
//             this.advance(stepArguments);
//           }
//         },
//       },
//       this.stepDuration,
//       this.nextStepTime,
//       name);
//   }
//
//   private readAny(operation: SequenceOperation, stepArguments: StepArguments, name: string) {
//     let firstEnded = false;
//     let secondEnded = false;
//
//     const leftHead = PlayHead.createForSequenceLike(this.player, operation.left, {
//         ...stepArguments,
//         onEnded: () => {
//           firstEnded = true;
//
//           if (!secondEnded) {
//             this.nextStepTime = leftHead.nextStepTime;
//             this.advance(stepArguments);
//           }
//         },
//       },
//       this.stepDuration,
//       this.nextStepTime,
//       name);
//
//     const rightHead = PlayHead.createForSequenceLike(this.player, operation.right, {
//         ...stepArguments,
//         onEnded: () => {
//           secondEnded = true;
//
//           if (!firstEnded) {
//             this.nextStepTime = rightHead.nextStepTime;
//             this.advance(stepArguments);
//           }
//         },
//       },
//       this.stepDuration,
//       this.nextStepTime,
//       name);
//   }
//
//   private readLeft(operation: SequenceOperation, stepArguments: StepArguments) {
//     const leftHead = PlayHead.createForSequenceLike(this.player, operation.left, {
//         ...stepArguments,
//         onEnded: () => {
//           this.nextStepTime = leftHead.nextStepTime;
//           this.advance(stepArguments);
//         },
//       },
//       this.stepDuration,
//       this.nextStepTime,
//       '(left)');
//
//     PlayHead.createForSequenceLike(this.player, operation.right, {
//         ...stepArguments,
//         onEnded: () => {
//         },
//       },
//       this.stepDuration,
//       this.nextStepTime,
//       '(right)');
//   }
//
//   private readRight(operation: SequenceOperation, stepArguments: StepArguments) {
//     PlayHead.createForSequenceLike(this.player, operation.left, {
//         ...stepArguments,
//         onEnded: () => {
//         },
//       },
//       this.stepDuration,
//       this.nextStepTime,
//       '(left)');
//
//     const rightHead = PlayHead.createForSequenceLike(this.player, operation.right, {
//         ...stepArguments,
//         onEnded: () => {
//           this.nextStepTime = rightHead.nextStepTime;
//           this.advance(stepArguments);
//         },
//       },
//       this.stepDuration,
//       this.nextStepTime,
//       '(right)');
//   }
//
//   private advance(stepArguments: StepArguments) {
//     this.stepPositionInSequence++;
//     this.readNextStep(stepArguments);
//   }
//
//   private scheduleAdvance(stepArguments: StepArguments): void {
//     this.nextStepTime += this.stepDuration / this.player.speed;
//     this.scheduler.schedule(this.nextStepTime, () => this.advance(stepArguments));
//   }
//
//   private readNextStep(stepArguments: StepArguments): void {
//     if (this.stepPositionInSequence >= this.currentSequence.length) {
//       stepArguments.onEnded();
//       return;
//     }
//
//     const step = this.currentSequence[this.stepPositionInSequence];
//
//     // TODO add discriminator for steps and use switch
//     if (step) {
//       if (step.flag != null) {
//         return this.advance(stepArguments);
//       }
//
//       if (step.jump != null) {
//         return this.readJumpStep(step, stepArguments);
//       }
//
//       if (step.innerSequence != null) {
//         return this.readInnerSequence(step, stepArguments);
//       }
//
//       if (step.controlMessage != null) {
//         return this.readControlMessage(step.controlMessage, stepArguments);
//       }
//
//       this.readMessages(step, stepArguments);
//     }
//   }
//
//   private readMessages(step: Step, stepArguments: StepArguments): void {
//     let noteOnCounter = 0;
//
//     if (step.messages != null) {
//       noteOnCounter = this.sendMessages(step);
//     }
//
//     stepArguments.onStepPlay({
//       timeStep: this.timeStep,
//       timePosition: this.nextStepTime,
//       sequenceStack: this.sequenceStack.map(stack => stack.name),
//       stepNumber: this.stepPositionInSequence,
//       noteOnCount: noteOnCounter,
//     });
//
//     this.timeStep++;
//
//     this.scheduleAdvance(stepArguments);
//   }
//
//   private sendMessages(step: Step): number {
//     let noteOnCounter = 0;
//
//     step.messages.forEach(message => {
//       const evaluatedParams = {} as any;
//       Object.entries(message.params)
//         .forEach(([key, value]) => evaluatedParams[key] = isPrimitive(value) ? value : Interpreter.evaluate(value, this.player.codeProvider.code, this.context));
//
//       let {p, v, i, c} = evaluatedParams;
//
//       let track = this.tracks.get(i);
//
//       if (track == null) {
//         this.tracks.set(i, new Track(this.player.output));
//         track = this.tracks.get(i);
//       }
//
//       if (message.silent) {
//         track.silence();
//       } else if (!isNaN(p) && p >= 0 && p < 128) {
//         track.noteOn(p, v, c);
//         noteOnCounter++;
//       } else if (v != null) {
//         track.velocityChange(v);
//       }
//     });
//
//     return noteOnCounter;
//   }
//
//   private readInnerSequence(step: Step, stepArguments: StepArguments): void {
//     this.reinterpretCode();
//     this.readSequenceLike(step.innerSequence.content, stepArguments, 'inner');
//   }
//
//   private readSequenceRef(ref: SequenceRef, stepArguments: StepArguments) {
//     const {sequenceName, flagName} = ref;
//
//     const declaration = this.findDeclaration(sequenceName);
//
//     if (declaration != null && !isPrimitive(declaration.value)) {
//       const targetSequence = declaration.value as SequenceDeclaration;
//       const previousPosition = this.stepPositionInSequence;
//       this.stepPositionInSequence = 0;
//
//       if (flagName) {
//         const foundIndex = this.findFlagPosition(flagName, targetSequence.steps);
//         if (foundIndex > 0) {
//           this.stepPositionInSequence = foundIndex;
//         }
//       } else {
//         this.stepPositionInSequence = 0;
//       }
//
//       this.pushSequence({name: sequenceName, steps: targetSequence.steps});
//
//       this.readNextStep({
//         ...stepArguments,
//         onEnded: () => {
//           this.popSequenceAndRefreshCurrent();
//           this.stepPositionInSequence = previousPosition + 1;
//           this.readNextStep(stepArguments);
//         }
//       });
//     } else {
//       this.advance(stepArguments);
//     }
//   }
//
//   private readJumpStep(step: Step, stepArguments: StepArguments): void {
//     this.reinterpretCode();
//     this.refreshCurrent();
//
//     if (step.jump.sequence) {
//       if (this.findDeclaration(step.jump.sequence) != null) {
//         this.stepPositionInSequence = 0;
//       } else {
//         this.advance(stepArguments);
//         return;
//       }
//     }
//
//     if (step.jump.flag) {
//       const jumpPosition = this.findFlagPosition(step.jump.flag, this.currentSequence);
//
//       if (jumpPosition >= 0) {
//         this.stepPositionInSequence = jumpPosition;
//       }
//     }
//
//     this.readNextStep(stepArguments);
//   }
//
//   private readControlMessage(controlMessage: ControlMessage, stepArguments: StepArguments) {
//     if (controlMessage.target === 'head') {
//       Object.entries(controlMessage.params).forEach(entry => {
//         if (entry[0] === 'stepDuration') {
//           this.stepDuration = entry[1];
//         }
//       });
//     } else if (controlMessage.target === 'player') {
//       Object.entries(controlMessage.params).forEach(entry => {
//         if (entry[0] === 'speed') {
//           this.player.speed = +entry[1];
//         }
//       })
//     }
//
//     this.advance(stepArguments);
//   }
//
//   private readTernary(maybeSequence: TernaryInstruction, stepArguments: StepArguments, name: string) {
//     const wrappedArgs = {
//       ...stepArguments,
//       onEnded: () => {
//         this.advance(stepArguments);
//       }
//     }
//     if (maybeSequence.condition) {
//       this.readSequenceLike(maybeSequence.ifBranch, wrappedArgs, name);
//     } else {
//       this.readSequenceLike(maybeSequence.elseBranch, wrappedArgs, name);
//     }
//   }
//
//   private reinterpretCode(): void {
//     this.player.reinterpretCode();
//   }
//
//   private pushSequence(namedSequence: { name: string, steps: Step[] }): void {
//     this.sequenceStack.push(namedSequence);
//   }
//
//   private popSequence(): void {
//     this.sequenceStack.pop();
//   }
//
//   private popSequenceAndRefreshCurrent(): void {
//     this.popSequence();
//     this.refreshCurrent();
//   }
//
//   private refreshCurrent(): void {
//     const current = this.sequenceStack[this.sequenceStack.length - 1];
//
//     if (current && Object.keys(this.program).includes(current.name)) {
//       const maybeSequence = this.findDeclaration(current.name)?.value;
//
//       if (maybeSequence && typeof maybeSequence === 'object' && maybeSequence.kind === InstructionKind.SequenceDeclaration) {
//         current.steps = maybeSequence.steps;
//       }
//     }
//   }
//
//   private findFlagPosition(flagName: string, steps: Step[]) {
//     const flagStep = steps.find(s => s.flag?.name === flagName);
//     return steps.indexOf(flagStep);
//   }
//
//   private readLazyExpression(lazyExpression: LazyExpression, stepArguments: StepArguments, context: Expr[]): void {
//     this.readSequenceLike(Interpreter.evaluate(lazyExpression.expr, this.player.codeProvider.code, context), stepArguments, '(lazy)');
//   }
// }
//
// function isPrimitive(thing: any) {
//   return ['number', 'boolean', 'string'].includes(typeof thing);
// }
//
// class Track {
//   private _latestVelocity = 0;
//   private _pendingPitch: number;
//   private _pendingChannel: number;
//   private _latestChannel: number;
//
//   constructor(public readonly output: MidiOutput) {
//   }
//
//   noteOn(pitch: number, velocity?: number, channel?: number) {
//     this.endPendingNote();
//
//     if (velocity != null) {
//       velocity = Math.min(Math.max(0, velocity), 127);
//       this._latestVelocity = velocity;
//     } else {
//       velocity = this._latestVelocity;
//     }
//
//     channel = channel ?? this._latestChannel ?? 0;
//
//     this.output.noteOn(pitch, velocity, channel);
//     this._pendingPitch = pitch;
//     this._pendingChannel = channel;
//     this._latestChannel = channel;
//   }
//
//   silence() {
//     this.endPendingNote();
//   }
//
//   velocityChange(velocity: number) {
//     if (!isNaN(velocity)) {
//       velocity = Math.min(Math.max(0, velocity), 127);
//       this._latestVelocity = velocity;
//     }
//   }
//
//   private endPendingNote(): void {
//     if (this._pendingPitch != null) {
//       this.output.noteOff(this._pendingPitch, 0, this._pendingChannel);
//       this._pendingPitch = null;
//       this._pendingChannel = null;
//     }
//   }
// }
//
// export interface StepPlayInfo {
//   timeStep: number;
//   timePosition: number;
//   sequenceStack: string[];
//   stepNumber: number;
//   noteOnCount: number;
// }
//
// export type StepPlayCallback = (info: StepPlayInfo) => void;
//
// interface StepArguments {
//   onStepPlay: StepPlayCallback;
//   onEnded: Function
// }
