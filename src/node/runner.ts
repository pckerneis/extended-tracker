import {CodeProvider, Player} from '../common/player/Player';
import {MidiProcessor} from '../common/player/MidiProcessor';
import {PrintProcessor} from '../common/player/PrintProcessor';
import {NodeMidiOutput} from '../common/midi/NodeMidiOutput';
import {performance} from 'perf_hooks';

function clockFn(): number {
  return performance.now() / 1000;
}

export function runProgram(codeProvider: CodeProvider,
                           entryPoint: string,
                           output: never,
                           onProgramEnded: () => void): void {
  const player = Player.create({
    codeProvider,
    entryPoint,
    processors: [
      new MidiProcessor(new NodeMidiOutput(output), clockFn),
      new PrintProcessor(),
      {
        ended: () => onProgramEnded(), process: () => {}
      }
    ],
    clockFn,
  });

  player.start(entryPoint);
}
