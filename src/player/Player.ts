import {CodeProvider, Interpreter} from '../interpreter/Interpreter';
import {MidiOutput} from '../midi/MidiOutput';
import {ErrorReporter} from '../error/ErrorReporter';

export class Player {

  private constructor(private readonly errorReporter: ErrorReporter) {
  }

  public static play(codeSource: CodeProvider,
                     output: MidiOutput,
                     onEnded: Function,
                     onStepPlay: Function,
                     errorReporter?: ErrorReporter): void {
    if (errorReporter == null) {
      errorReporter = {
        reportError: (...args: any[]) => console.error(args),
      }
    }
    const player = new Player(errorReporter);
    player.doPlay(codeSource, output, onEnded, onStepPlay);
  }

  private doPlay(codeSource: CodeProvider, output: MidiOutput, onEnded: Function, onStepPlay: Function): void {
    const result = Interpreter.interpret(codeSource.code, this.errorReporter);

    if (result == null) {
      onEnded();
      return;
    }

    let steps = result.steps;
    let position = 0;

    const handler = () => {
      const step = steps[position];

      if (step) {
        if (step.flag != null) {
          position++;
          handler();
          return;
        }

        if (step.jump != null) {
          const messageSequence = Interpreter.interpret(codeSource.code, this.errorReporter);

          if (messageSequence != null) {
            steps = messageSequence.steps;
          }

          const jumpStep = steps.find(s => s.flag?.name === step.jump.name);
          const jumpPosition = steps.indexOf(jumpStep);

          if (jumpPosition >= 0) {
            position = jumpPosition;
            handler();
            return;
          }
          handler();
        }

        if (step.messages != null) {
          step.messages.forEach(message => {
            let {p, v} = message;

            if (!isNaN(p) && p >= 0 && p < 128) {
              v = Math.min(Math.max(0, v), 127);
              output.noteOn(p, v);
            }
          });
        }

        onStepPlay({
          sequenceName: 'Program',  // TODO
          stepNumber: position,
          messagesCount: step.messages?.length,
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
