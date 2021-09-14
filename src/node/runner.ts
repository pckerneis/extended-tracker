import {CodeProvider, Player} from '../common/player/Player';
import {MidiProcessor} from '../common/player/MidiProcessor';
import {PrintProcessor} from './player/PrintProcessor';
import {NodeMidiOutput} from '../common/midi/NodeMidiOutput';
import {performance} from 'perf_hooks';

function clockFn(): number {
  return performance.now() / 1000;
}

export interface RunProgramOptions {
  codeProvider: CodeProvider;
  entryPoint: string;
  midiOutput: never;
  onProgramEnded: () => void;
  reportError: (...args: any[]) => void;
}

export function runProgram(options: RunProgramOptions): void {
  const {
    codeProvider,
    entryPoint,
    midiOutput,
    onProgramEnded,
    reportError,
  } = options;

  const player = Player.create({
    codeProvider,
    entryPoint,
    processors: [
      new MidiProcessor(new NodeMidiOutput(midiOutput), clockFn),
      new PrintProcessor(),
      {
        stopped: () => onProgramEnded(), ended: () => onProgramEnded(), process: () => {}
      }
    ],
    clockFn,
    errorReporter: { reportError },
  });

  player.start(entryPoint);
}
