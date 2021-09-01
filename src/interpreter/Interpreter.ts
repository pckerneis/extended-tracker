import {Assign, Expr, Flag, InnerSequence, Jump, Kind, Sequence, TrackList} from '../parser/Ast';
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
  sequence?: string;
  flag?: string;
}

export interface Step {
  messages?: Message[];
  flag?: FlagMessage;
  jump?: JumpMessage;
  innerSequenceName?: string;
}

export interface MessageSequence {
  Program: Step[];
  [sequenceName: string]: Step[];
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
    const messageSequence: MessageSequence = { Program: null };
    messageSequence.Program = this.readSequence(programDeclaration, expressions, messageSequence);
    return messageSequence;
  }

  private static readSequence(sequenceDeclaration: Assign, expressions: Expr[], output: MessageSequence): Step[] {
    const steps: Step[] = [];

    if (sequenceDeclaration && sequenceDeclaration.value.kind === Kind.SEQUENCE) {
      const programSequence = sequenceDeclaration.value as Sequence;

      programSequence.expressions.forEach(channelsOrFlagOrJump => {
        if (channelsOrFlagOrJump.kind === Kind.FLAG) {
          steps.push(this.processFlagStep(channelsOrFlagOrJump));
        } else if (channelsOrFlagOrJump.kind === Kind.JUMP) {
          steps.push(this.processJumpStep(channelsOrFlagOrJump));
        } else if (channelsOrFlagOrJump.kind === Kind.TRACKS) {
          steps.push(this.processTracks(channelsOrFlagOrJump));
        } else if (channelsOrFlagOrJump.kind === Kind.INNER_SEQUENCE) {
          steps.push(this.processInnerSequence(channelsOrFlagOrJump, expressions, output));
        }
      });
    }

    return steps;
  }

  private static processTracks(channelsOrFlagOrJump: TrackList): Step {
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
            message.params[param.assignee.lexeme] = param.value?.kind === Kind.LITERAL ? param.value.value : null;

            if (param.assignee.lexeme === '-') {
              message.silent = true;
            }
          }
        });
      }

      messages.push(message);
    });

    return {messages};
  }

  private static processFlagStep(channelsOrFlagOrJump: Flag): Step {
    const flag = ({name: channelsOrFlagOrJump.name.lexeme});
    return {flag};
  }

  private static processJumpStep(jumpExpr: Jump): Step {
    const jump = {sequence: jumpExpr.sequence?.lexeme, flag: jumpExpr.flag?.lexeme};
    return {jump};
  }

  private static processInnerSequence(innerSequence: InnerSequence, expressions: Expr[], output: MessageSequence): Step {
    const innerSequenceName: string = innerSequence.name.lexeme;
    const sequenceDeclaration = this.findDeclaration(innerSequenceName, expressions);

    if (sequenceDeclaration != null && output[innerSequenceName] == null) {
      output[innerSequenceName] = this.readSequence(sequenceDeclaration, expressions, output);
    }

    return {innerSequenceName};
  }

  private static findDeclaration(variableName: string, expressions: Expr[]): Assign {
    return expressions.find(expr => expr.kind === 'ASSIGN'
      && expr.assignee.lexeme === variableName) as Assign;
  }
}
