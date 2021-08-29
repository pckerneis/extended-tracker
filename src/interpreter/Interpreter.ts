import {Assign, Expr, Kind, Sequence} from '../parser/Ast';
import {Parser} from '../parser/Parser';
import {Scanner} from '../scanner/Scanner';
import {ErrorReporter} from '../error/ErrorReporter';

export interface CodeProvider {
  code: string;
}

export interface Message {
  params: { [paramName: string]: any };
  silent: boolean;
}

export interface FlagMessage {
  name: string;
}

export interface JumpMessage {
  name: string;
}

export interface Step {
  messages?: Message[];
  flag?: FlagMessage;
  jump?: JumpMessage;
}

export interface MessageSequence {
  steps: Step[];
}

export class Interpreter {
  public static PROGRAM_VARIABLE: string = 'Program';

  public static interpret(code: string, errorReporter: ErrorReporter): MessageSequence {
    try {
      const tokens = Scanner.scan(code);
      const expressions = Parser.parse(tokens);
      return this.readProgram(expressions);
    } catch (e) {
      errorReporter.reportError(e.message);
    }
  }

  private static readProgram(expressions: Expr[]): MessageSequence {
    const programDeclaration = this.findDeclaration(this.PROGRAM_VARIABLE, expressions);
    const steps: Step[] = [];

    if (programDeclaration && programDeclaration.value.kind === Kind.SEQUENCE) {
      const programSequence = programDeclaration.value as Sequence;

      programSequence.expressions.forEach(channelsOrFlagOrJump => {

        if (channelsOrFlagOrJump.kind === Kind.FLAG) {
          const flag = ({name: channelsOrFlagOrJump.name.lexeme});
          steps.push({flag});
        } else if (channelsOrFlagOrJump.kind === Kind.JUMP) {
          const jump = {name: channelsOrFlagOrJump.name.lexeme};
          steps.push({jump});
        } else if (channelsOrFlagOrJump.kind === Kind.TRACKS) {
          const messages: Message[] = [];

          channelsOrFlagOrJump.tracks.forEach((params, channelIndex) => {
            const message: Message = {
              params: {
                i: channelIndex
              },
              silent: false,
            };

            if (params.kind === Kind.PARAMS) {
              params.params.forEach(param => {
                if (param.kind === Kind.PARAM) {
                  message.params[param.assignee.lexeme] = param.value.kind === Kind.LITERAL ? param.value.value : null;
                } else if (param.kind === Kind.SILENCE) {
                  message.silent = true;
                }
              });
            }

            messages.push(message);
          });

          steps.push({messages});
        }
      });
    }

    return {steps};
  }

  private static findDeclaration(variableName: string, expressions: Expr[]): Assign {
    return expressions.find(expr => expr.kind === 'ASSIGN'
      && expr.assignee.lexeme === variableName) as Assign;
  }
}
