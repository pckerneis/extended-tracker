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

    console.log(steps);

    const handler = () => {
      const step = steps[position];

      if (step) {
        if (step.flag != null) {
          position++;
          handler();
          return;
        }

        if (step.jump != null) {
          const jumpStep = steps.find(s => s.flag.name === step.jump.name);
          const jumpPosition = steps.indexOf(jumpStep);

          if (jumpPosition >= 0) {
            position = jumpPosition + 1;
            handler();
            return;
          }
        }

        step.messages.forEach(message => {
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
