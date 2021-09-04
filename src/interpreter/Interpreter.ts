import {
  Assign,
  AstNodeKind,
  Binary, Control,
  Expr,
  Flag,
  InnerSequence,
  Jump,
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
import {Token, TokenType} from "../scanner/Tokens";

export enum InstructionKind {
  Message = 'Message',
  Flag = 'Flag',
  Jump = 'Jump',
  Step = 'Step',
  InnerSequence = 'InnerSequence',
  SequenceRef = 'SequenceRef',
  SequenceOperation = 'SequenceOperation',
  SequenceDeclaration = 'SequenceDeclaration',
  ControlMessage = 'ControlMessage',
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
  controlMessage?: ControlMessage;
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
  kind: InstructionKind.SequenceDeclaration;
  steps: Step[];
}

export interface ControlMessage {
  kind: InstructionKind.ControlMessage;
  params: { [paramName: string]: any };
  target: string;
}

export type SequenceOperationKind = 'left' | 'all' | 'any';

export interface SequenceOperation {
  kind: InstructionKind.SequenceOperation;
  operation: SequenceOperationKind;
  left: SequenceLike;
  right: SequenceLike;
}

export interface MessageSequence {
  [sequenceName: string]: Assignable;
}

export type SequenceLike = SequenceDeclaration | SequenceOperation;

export type Assignable = SequenceDeclaration | SequenceOperation | number | string | boolean;

function findSequenceOperation(operator: Token): SequenceOperationKind {
  switch(operator.lexeme) {
    case '&': return 'all';
    case '||': return 'any';
  }

  throw new Error('Unhandled sequence operation token ' + operator.lexeme);
}

export class Interpreter {

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
    let output = {};

    expressions.forEach(expression => {
      if (expression.kind === AstNodeKind.ASSIGN && output[expression.assignee.lexeme] == null) {
        output[expression.assignee.lexeme] = this.evaluate(expression.value, expressions);
      }
    });

    return output;
  }

  private static processTracks(channelsOrFlagOrJump: TrackList, topLevelExpressions: Expr[]): Step {
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
            message.params[param.assignee.lexeme] = this.evaluate(param?.value, topLevelExpressions);

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

  private static processInnerSequence(innerSequence: InnerSequence, topLevelExpressions: Expr[]): Step {
    if (innerSequence.maybeSequence.kind === 'SEQUENCE_FLAG_REF') {
      const ref = innerSequence.maybeSequence as SequenceFlagRef;

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
            operation: findSequenceOperation(innerSequence.maybeSequence.operator),
            left: this.evaluate(innerSequence.maybeSequence.left, topLevelExpressions),
            right: this.evaluate(innerSequence.maybeSequence.right, topLevelExpressions),
          }
        }
      }
    }
  }

  private static findDeclaration(variableName: string, topLevelExpressions: Expr[]): Assign {
    return topLevelExpressions.find(expr => expr.kind === 'ASSIGN'
      && expr.assignee.lexeme === variableName) as Assign;
  }

  private static evaluate(expr: Expr | undefined, topLevelExpressions: Expr[]): any {
    if (! expr) {
      return null;
    }

    switch (expr.kind) {
      case 'VARIABLE':
        return this.evaluateVariable(expr, topLevelExpressions);
      case 'LITERAL':
        return evaluateLiteral(expr);
      case 'RL_UNARY':
        return this.evaluateRLUnary(expr, topLevelExpressions);
      case 'BINARY':
        return this.evaluateBinary(expr, topLevelExpressions);
      case 'GROUPING':
        return this.evaluate(expr.expr, topLevelExpressions);
      case 'TERNARY_COND':
        return this.evaluateTernaryCondition(expr, topLevelExpressions);
      case 'LOGICAL':
        return this.evaluateLogical(expr, topLevelExpressions);
      case 'SEQUENCE':
        return this.evaluateSequenceDeclaration(expr, topLevelExpressions);
    }
  }

  private static evaluateLogical(expr: Logical, topLevelExpressions: Expr[]): Assignable {
    const left = this.evaluate(expr.left, topLevelExpressions);
    const right = this.evaluate(expr.right, topLevelExpressions);

    if (typeof left === 'object' && typeof right === 'object') {
      return {
        kind: InstructionKind.SequenceOperation,
        operation: findSequenceOperation(expr.operator),
        left,
        right,
      };
    } else {
      if (expr.operator.type === TokenType.AMPERSAND) {
        return left && right;
      } else {
        return left || right;
      }
    }
  }

  private static evaluateTernaryCondition(expr: TernaryCondition, topLevelExpressions: Expr[]): any {
    const predicate = this.evaluate(expr.condition, topLevelExpressions);

    if (predicate) {
      return this.evaluate(expr.ifBranch, topLevelExpressions);
    } else {
      return this.evaluate(expr.elseBranch, topLevelExpressions)
    }
  }

  private static evaluateRLUnary(expr: RLUnary, topLevelExpressions: Expr[]): any {
    const right = this.evaluate(expr.right, topLevelExpressions);

    switch (expr.operator.type) {
      case TokenType.BANG:
        return !asBoolean(right);
      case TokenType.MINUS:
        return -this.asNumber(right);
    }

    return null;
  }

  private static evaluateBinary(expr: Binary, topLevelExpressions: Expr[]): any {
    const left = this.evaluate(expr.left, topLevelExpressions);
    const right = this.evaluate(expr.right, topLevelExpressions);

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

  private static evaluateVariable(expr: Variable, topLevelExpressions: Expr[]): any {
    return this.evaluate(this.findDeclaration(expr.name.lexeme, topLevelExpressions).value, topLevelExpressions);
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

  private static evaluateSequenceDeclaration(sequence: Sequence, topLevelExpressions: Expr[]): SequenceDeclaration {
    return {
      kind: InstructionKind.SequenceDeclaration,
      steps: sequence.expressions.map(channelsOrFlagOrJump => {
        if (channelsOrFlagOrJump.kind === AstNodeKind.CONTROL_MESSAGE) {
          return this.processControlMessage(channelsOrFlagOrJump, topLevelExpressions);
        } else if (channelsOrFlagOrJump.kind === AstNodeKind.FLAG) {
          return this.processFlagStep(channelsOrFlagOrJump);
        } else if (channelsOrFlagOrJump.kind === AstNodeKind.JUMP) {
          return this.processJumpStep(channelsOrFlagOrJump);
        } else if (channelsOrFlagOrJump.kind === AstNodeKind.TRACKS) {
          return this.processTracks(channelsOrFlagOrJump, topLevelExpressions);
        } else if (channelsOrFlagOrJump.kind === AstNodeKind.INNER_SEQUENCE) {
          return this.processInnerSequence(channelsOrFlagOrJump, topLevelExpressions);
        }
      })
    };
  }

  private static processControlMessage(control: Control, topLevelExpressions: Expr[]): Step {
    const params = {};
    control.params.forEach(param => {
      if (param.kind === AstNodeKind.PARAM) {
        params[param.assignee.lexeme] = this.evaluate(param?.value, topLevelExpressions);
      }
    });

    const controlMessage: ControlMessage = ({kind: InstructionKind.ControlMessage, target: control.target.lexeme, params});
    return {kind: InstructionKind.Step, controlMessage};
  }
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
