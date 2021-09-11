import {Player, CodeProvider} from './player/Player';
import {MidiProcessor} from './player/MidiProcessor';
import {PrintProcessor} from './player/PrintProcessor';
import {MidiOutput} from './midi/MidiOutput';

export function runProgram(codeProvider: CodeProvider,
                    entryPoint: string,
                    output: any,
                    onProgramEnded: Function) {
  Player.read(codeProvider, entryPoint, [
    new MidiProcessor(new MidiOutput(output)),
    new PrintProcessor(),
    { ended: () => onProgramEnded(), process: () => {} }
  ]);
}
