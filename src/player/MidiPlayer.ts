// import {Interpreter, Program} from '../interpreter/Interpreter';
// import {MidiOutput} from '../midi/MidiOutput';
// import {ErrorReporter} from '../error/ErrorReporter';
// import {Scheduler} from '../scheduler/Scheduler';
// import {PlayHead, StepPlayCallback} from './PlayHead';
//
// export interface CodeProvider {
//   code: string;
// }
//
// export class MidiPlayer {
//
//   private _program: Program;
//   private _scheduler: Scheduler = new Scheduler();
//   private playHead: PlayHead;
//   private latestInterpretedCode: string;
//   private _speed: number = 1;
//
//   set speed(speed: number) {
//     if (!isNaN(speed) && speed > 0) {
//       this._speed = speed;
//     } else {
//       // TODO use error reporter?
//       console.error('Wrong speed value ' + speed);
//     }
//   }
//
//   get speed(): number {
//     return this._speed;
//   }
//
//   public get scheduler(): Scheduler {
//     return this._scheduler;
//   }
//
//   public get program(): Program {
//     return this._program;
//   }
//
//   private constructor(public readonly codeProvider: CodeProvider,
//                       public readonly output: MidiOutput,
//                       public readonly errorReporter: ErrorReporter) {
//   }
//
//   public static play(codeProvider: CodeProvider,
//                      entryPointName: string,
//                      output: MidiOutput,
//                      onEnded: Function,
//                      onStepPlay: StepPlayCallback,
//                      errorReporter?: ErrorReporter): void {
//     if (errorReporter == null) {
//       errorReporter = {
//         reportError: (...args: any[]) => console.error(args),
//       }
//     }
//     const player = new MidiPlayer(codeProvider, output, errorReporter);
//     player.doPlay(entryPointName, onEnded, onStepPlay);
//   }
//
//   private doPlay(entryPointName: string, onEnded: Function, onStepPlay: StepPlayCallback): void {
//     this.reinterpretCode();
//
//     if (this.latestInterpretedCode) {
//       try {
//         this.playHead = PlayHead.createAtRoot(this, entryPointName, {
//           onEnded: () => {
//             this.output.allSoundOff();
//             onEnded();
//           }, onStepPlay
//         }, 0.25, 0);
//         this._scheduler.start();
//       } catch (e) {
//         this.errorReporter.reportError(e);
//         onEnded();
//       }
//     } else {
//       onEnded();
//     }
//   }
//
//   public reinterpretCode(): void {
//     const code = this.codeProvider.code;
//
//     if (code !== this.latestInterpretedCode) {
//       const newProgram = Interpreter.interpret(this.codeProvider.code, this.errorReporter);
//
//       if (newProgram != null) {
//         console.log('Program interpreted')
//         this._program = newProgram;
//         this.latestInterpretedCode = code;
//       } else {
//         console.error('Program could not be interpreted.');
//       }
//     }
//   }
// }
