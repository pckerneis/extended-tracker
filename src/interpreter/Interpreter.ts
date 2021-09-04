import {
  Assign,
  Binary,
  Expr,
  Flag,
  InnerSequence,
  Jump,
  AstNodeKind,
  Literal,
  Logical,
  RLUnary,
  Sequence,
  SequenceFlagRef,
  TernaryCondition,
  TrackList,
  Variable
} from '../parser/Ast';
import {Parser} from '../parser/Parser';
import {Scanner} from '../scanner/Scanner';
import {ErrorReporter} from '../error/ErrorReporter';
import {TokenType} from "../scanner/Tokens";

export enum InstructionKind {
  Message = 'Message',
  Flag = 'Flag',
  Jump = 'Jump',
  Step = 'Step',
  InnerSequence = 'InnerSequence',
  SequenceRef = 'SequenceRef',
  SequenceOperation = 'SequenceOperation',
  SequenceDeclaration = 'SequenceDeclaration',
}

export interface Message {
  kind: InstructionKind.Message;
  params: { [paramName: string]: any };
  silent: boolean;
}

export interface FlagMessage {
  kind: InstructionKind.Flag;
  name: string;
}

export interface JumpMessage {
  kind: InstructionKind.Jump;
  sequence?: string;
  flag?: string;
}

export interface Step {
  kind: InstructionKind.Step;
  messages?: Message[];
  flag?: FlagMessage;
  jump?: JumpMessage;
  innerSequence?: InnerSequenceMessage;
}

export interface InnerSequenceMessage {
  kind: InstructionKind.InnerSequence;
  content: SequenceRef | SequenceOperation | Sequence;
}

export interface SequenceRef {
  kind: InstructionKind.SequenceRef;
  sequenceName: string;
  flagName?: string;
}

export interface SequenceDeclaration {
  kind: InstructionKind.SequenceDeclaration,
  steps: Step[];
}

export interface SequenceOperation {
  kind: InstructionKind.SequenceOperation;
  left: SequenceLike;
  right: SequenceLike;
}

export interface MessageSequence {
  [sequenceName: string]: Assignable;
}

export type SequenceLike = SequenceDeclaration | SequenceOperation;

export type Assignable = SequenceDeclaration | SequenceOperation | number | string | boolean;

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
    messageSequence.Program = this.readSequence(programDeclaration.value, expressions, messageSequence);
    return messageSequence;
  }

  private static readSequence(maybeSequence: Expr, topLevelExpressions: Expr[], output: MessageSequence): SequenceDeclaration | SequenceOperation {
    if (!maybeSequence) {
      return { kind: InstructionKind.SequenceDeclaration, steps: [] };
    }

    if (maybeSequence.kind === AstNodeKind.SEQUENCE) {
      return this.evaluateSequenceDeclaration(maybeSequence, topLevelExpressions, output);
    } else if (maybeSequence.kind === AstNodeKind.BINARY) {
      const { left, right } = maybeSequence;
      return {
        kind: InstructionKind.SequenceOperation,
        left: this.readSequence(left, topLevelExpressions, output),
        right: this.readSequence(right, topLevelExpressions, output),
      }
    }

    console.debug('hey')
    return { kind: InstructionKind.SequenceDeclaration, steps: [] };
  }

  private static processTracks(channelsOrFlagOrJump: TrackList, topLevelExpressions: Expr[], output: MessageSequence): Step {
    const messages: Message[] = [];

    channelsOrFlagOrJump.tracks.forEach((params, channelIndex) => {
      const message: Message = {
        kind: InstructionKind.Message,
        params: {
          i: channelIndex
        },
        silent: false,
      };

      if (params.kind === AstNodeKind.PARAMS) {
        params.params.forEach(param => {
          if (param.kind === AstNodeKind.PARAM) {
            message.params[param.assignee.lexeme] = this.evaluate(param?.value, topLevelExpressions, output);

            if (param.assignee.lexeme === '-') {
              message.silent = true;
            }
          }
        });
      }

      messages.push(message);
    });

    return {
      kind: InstructionKind.Step,
      messages
    };
  }

  private static processFlagStep(channelsOrFlagOrJump: Flag): Step {
    const flag: FlagMessage = ({kind: InstructionKind.Flag, name: channelsOrFlagOrJump.name.lexeme});
    return {kind: InstructionKind.Step, flag};
  }

  private static processJumpStep(jumpExpr: Jump): Step {
    const jump: JumpMessage = {kind: InstructionKind.Jump, sequence: jumpExpr.sequence?.lexeme, flag: jumpExpr.flag?.lexeme};
    return {kind: InstructionKind.Step, jump};
  }

  private static processInnerSequence(innerSequence: InnerSequence, topLevelExpressions: Expr[], output: MessageSequence): Step {
    if (innerSequence.maybeSequence.kind === 'SEQUENCE_FLAG_REF') {
      const ref = innerSequence.maybeSequence as SequenceFlagRef;
      const innerSequenceName: string = ref.sequenceName.lexeme;
      const sequenceDeclaration = this.findDeclaration(innerSequenceName, topLevelExpressions);

      if (sequenceDeclaration != null && output[innerSequenceName] == null) {
        output[innerSequenceName] = this.readSequence(sequenceDeclaration.value, topLevelExpressions, output);
      }

      return {
        kind: InstructionKind.Step,
        innerSequence: {
          kind: InstructionKind.InnerSequence,
          content: {
            kind: InstructionKind.SequenceRef,
            sequenceName: ref.sequenceName.lexeme,
            flagName: ref.flagName?.lexeme,
          },
        }
      };
    } else if (innerSequence.maybeSequence.kind === 'VARIABLE') {
      const innerSequenceName: string = innerSequence.maybeSequence.name.lexeme;
      const sequenceDeclaration = this.findDeclaration(innerSequenceName, topLevelExpressions);

      if (sequenceDeclaration != null && output[innerSequenceName] == null) {
        output[innerSequenceName] = this.readSequence(sequenceDeclaration.value, topLevelExpressions, output);
      }

      return {
        kind: InstructionKind.Step,
        innerSequence: {
          kind: InstructionKind.InnerSequence,
          content: {
            kind: InstructionKind.SequenceRef,
            sequenceName: innerSequence.maybeSequence.name.lexeme,
          },
        }
      };
    } else if (innerSequence.maybeSequence.kind === 'LOGICAL') {
      return {
        kind: InstructionKind.Step,
        innerSequence: {
          kind: InstructionKind.InnerSequence,
          content: {
            kind: InstructionKind.SequenceOperation,
            left: this.evaluate(innerSequence.maybeSequence.left, topLevelExpressions, output),
            right: this.evaluate(innerSequence.maybeSequence.right, topLevelExpressions, output),
          }
        }
      }
    }
  }

  private static findDeclaration(variableName: string, topLevelExpressions: Expr[]): Assign {
    return topLevelExpressions.find(expr => expr.kind === 'ASSIGN'
      && expr.assignee.lexeme === variableName) as Assign;
  }

  private static evaluate(expr: Expr | undefined, topLevelExpressions: Expr[], output: MessageSequence): any {
    if (! expr) {
      return null;
    }

    switch (expr.kind) {
      case 'VARIABLE':
        return this.evaluateVariable(expr, topLevelExpressions, output);
      case 'LITERAL':
        return evaluateLiteral(expr);
      case 'RL_UNARY':
        return this.evaluateRLUnary(expr, topLevelExpressions, output);
      case 'BINARY':
        return this.evaluateBinary(expr, topLevelExpressions, output);
      case 'GROUPING':
        return this.evaluate(expr.expr, topLevelExpressions, output);
      case 'TERNARY_COND':
        return this.evaluateTernaryCondition(expr, topLevelExpressions, output);
      case 'LOGICAL':
        return this.evaluateLogical(expr, topLevelExpressions, output);
      case 'SEQUENCE':
        return this.evaluateSequenceDeclaration(expr, topLevelExpressions, output);
    }
  }

  private static evaluateLogical(expr: Logical, topLevelExpressions: Expr[], output: MessageSequence): any {
    const left = this.evaluate(expr.left, topLevelExpressions, output);

    if (expr.operator.type == TokenType.PIPE) {
      if (isTruthy(left)) return left;
    } else {
      if (!isTruthy(left)) return left;
    }

    return this.evaluate(expr.right, topLevelExpressions, output);
  }

  private static evaluateTernaryCondition(expr: TernaryCondition, topLevelExpressions: Expr[], output: MessageSequence): any {
    const predicate = this.evaluate(expr.condition, topLevelExpressions, output);

    if (predicate) {
      return this.evaluate(expr.ifBranch, topLevelExpressions, output);
    } else {
      return this.evaluate(expr.elseBranch, topLevelExpressions, output)
    }
  }

  private static evaluateRLUnary(expr: RLUnary, topLevelExpressions: Expr[], output: MessageSequence): any {
    const right = this.evaluate(expr.right, topLevelExpressions, output);

    switch (expr.operator.type) {
      case TokenType.BANG:
        return !asBoolean(right);
      case TokenType.MINUS:
        return -this.asNumber(right);
    }

    return null;
  }

  private static evaluateBinary(expr: Binary, topLevelExpressions: Expr[], output: MessageSequence): any {
    const left = this.evaluate(expr.left, topLevelExpressions, output);
    const right = this.evaluate(expr.right, topLevelExpressions, output);

    switch (expr.operator.type) {
      case TokenType.PIPE:
        return this.asSequence(left) === this.asSequence(right);
      case TokenType.AMPERSAND:
        return this.asSequence(left) !== this.asSequence(right);
      case TokenType.EQUAL_EQUAL:
        return this.asNumber(left) === this.asNumber(right);
      case TokenType.BANG_EQUAL:
        return this.asNumber(left) !== this.asNumber(right);
      case TokenType.GREATER:
        return this.asNumber(left) > this.asNumber(right);
      case TokenType.GREATER_EQUAL:
        return this.asNumber(left) >= this.asNumber(right);
      case TokenType.LESS:
        return this.asNumber(left) < this.asNumber(right);
      case TokenType.LESS_EQUAL:
        return this.asNumber(left) <= this.asNumber(right);
      case TokenType.MINUS:
        return this.asNumber(left) - this.asNumber(right);
      case TokenType.SLASH:
        return this.asNumber(left) / this.asNumber(right);
      case TokenType.STAR:
        return this.asNumber(left) * this.asNumber(right);
      case TokenType.PLUS:
        return this.asNumber(left) + this.asNumber(right);
    }

    return null;
  }

  private static evaluateVariable(expr: Variable, topLevelExpressions: Expr[], output: MessageSequence): any {
    return this.evaluate(this.findDeclaration(expr.name.lexeme, topLevelExpressions).value, topLevelExpressions, output);
  }

  private static asNumber(thing: any): number {
    if (thing == null) {
      return 0;
    }

    if (typeof thing === 'boolean') {
      return +thing;
    } else if (typeof thing === 'number') {
      return thing;
    } else {
      return 0;
    }
  }

  private static asSequence(thing: any)  {
    console.debug(thing);
  }

  private static evaluateSequenceDeclaration(sequence: Sequence, topLevelExpressions: Expr[], output: MessageSequence): SequenceDeclaration {
    return {
      kind: InstructionKind.SequenceDeclaration,
      steps: sequence.expressions.map(channelsOrFlagOrJump => {
        if (channelsOrFlagOrJump.kind === AstNodeKind.FLAG) {
          return this.processFlagStep(channelsOrFlagOrJump);
        } else if (channelsOrFlagOrJump.kind === AstNodeKind.JUMP) {
          return this.processJumpStep(channelsOrFlagOrJump);
        } else if (channelsOrFlagOrJump.kind === AstNodeKind.TRACKS) {
          return this.processTracks(channelsOrFlagOrJump, topLevelExpressions, output);
        } else if (channelsOrFlagOrJump.kind === AstNodeKind.INNER_SEQUENCE) {
          return this.processInnerSequence(channelsOrFlagOrJump, topLevelExpressions, output);
        }
      })
    };
  }
}

function isTruthy(object: any): boolean {
  return !!object;
}

function asBoolean(thing: any): boolean {
  if (thing == null) {
    return false;
  }

  if (typeof thing === 'boolean') {
    return thing;
  } else if (typeof thing === 'number') {
    return !!thing;
  } else {
    return false;
  }
}

function evaluateLiteral(expr: Literal): any {
  return expr.token.literal;
}
