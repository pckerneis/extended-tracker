import {Player, CodeProvider} from '../common/player/Player';
import {MidiProcessor} from '../common/player/MidiProcessor';
import {PrintProcessor} from '../common/player/PrintProcessor';
import {NodeMidiOutput} from '../common/midi/NodeMidiOutput';
const {performance} = require('perf_hooks');

export function defaultClock(): number {
  return performance.now() / 1000;
}

export function runProgram(codeProvider: CodeProvider,
                    entryPoint: string,
                    output: any,
                    onProgramEnded: Function) {
  Player.read({
    codeProvider,
    entryPoint,
    processors: [
      new MidiProcessor(new NodeMidiOutput(output)),
      new PrintProcessor(),
      { ended: () => onProgramEnded(), process: () => {} }
    ],
    clockFn: defaultClock,
  });
}
