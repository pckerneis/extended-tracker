import {CodeProvider, Interpreter} from '../interpreter/Interpreter';
import {MidiOutput} from '../midi/MidiOutput';

export class Player {

  public static play(codeSource: CodeProvider, output: MidiOutput, onEnded: Function): void {
    const player = new Player();
    player.doPlay(codeSource, output, onEnded);
  }

  private doPlay(codeSource: CodeProvider, output: MidiOutput, onEnded: Function): void {
    const interpreter = new Interpreter(codeSource);
    const steps = interpreter.interpret().steps;
    let position = 0;

    const handler = () => {
      const step = steps[position];

      if (step) {
        step.forEach(message => {
          let {p, v} = message;

          if (! isNaN(p)) {
            v = v || 127;
            output.noteOn(p, v);
          }
        });
      }

      position++;

      if (position < steps.length) {
        setTimeout(handler, 500);
      } else {
        onEnded();
      }
    };

    handler();
  }
}
