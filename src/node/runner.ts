import {CodeProvider, Player} from '../common/player/Player';
import {MidiProcessor} from '../common/player/MidiProcessor';
import {PrintProcessor} from '../common/player/PrintProcessor';
import {NodeMidiOutput} from '../common/midi/NodeMidiOutput';
import {performance} from 'perf_hooks';

export function defaultClock(): number {
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
      new MidiProcessor(new NodeMidiOutput(output), defaultClock),
      new PrintProcessor(),
      {
        ended: () => onProgramEnded(), process: () => {}
      }
    ],
    clockFn: defaultClock,
  });

  player.start(entryPoint);
}
