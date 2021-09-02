import {
  Assign,
  Binary,
  Expr,
  Flag,
  InnerSequence,
  Jump,
  Kind,
  Literal,
  Logical,
  RLUnary,
  Sequence,
  TernaryCondition,
  TrackList,
  Variable
} from '../parser/Ast';
import {Parser} from '../parser/Parser';
import {Scanner} from '../scanner/Scanner';
import {ErrorReporter} from '../error/ErrorReporter';
import {TokenType} from "../scanner/Tokens";

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
  innerSequence?: InnerSequenceMessage;
}

export interface InnerSequenceMessage {
  sequenceName: string;
  flagName?: string;
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

  private static readSequence(sequenceDeclaration: Assign, topLevelExpressions: Expr[], output: MessageSequence): Step[] {
    const steps: Step[] = [];

    if (sequenceDeclaration && sequenceDeclaration.value.kind === Kind.SEQUENCE) {
      const programSequence = sequenceDeclaration.value as Sequence;

      programSequence.expressions.forEach(channelsOrFlagOrJump => {
        if (channelsOrFlagOrJump.kind === Kind.FLAG) {
          steps.push(this.processFlagStep(channelsOrFlagOrJump));
        } else if (channelsOrFlagOrJump.kind === Kind.JUMP) {
          steps.push(this.processJumpStep(channelsOrFlagOrJump));
        } else if (channelsOrFlagOrJump.kind === Kind.TRACKS) {
          steps.push(this.processTracks(channelsOrFlagOrJump, topLevelExpressions));
        } else if (channelsOrFlagOrJump.kind === Kind.INNER_SEQUENCE) {
          steps.push(this.processInnerSequence(channelsOrFlagOrJump, topLevelExpressions, output));
        }
      });
    }

    return steps;
  }

  private static processTracks(channelsOrFlagOrJump: TrackList, topLevelExpressions: Expr[]): Step {
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
            message.params[param.assignee.lexeme] = this.evaluate(param?.value, topLevelExpressions);

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

  private static processInnerSequence(innerSequence: InnerSequence, topLevelExpressions: Expr[], output: MessageSequence): Step {
    const innerSequenceName: string = innerSequence.sequenceName.lexeme;
    const sequenceDeclaration = this.findDeclaration(innerSequenceName, topLevelExpressions);

    if (sequenceDeclaration != null && output[innerSequenceName] == null) {
      output[innerSequenceName] = this.readSequence(sequenceDeclaration, topLevelExpressions, output);
    }

    return {
      innerSequence: {
        sequenceName: innerSequenceName,
        flagName: innerSequence.flagName?.lexeme,
      }
    };
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
      // case 'SEQUENCE':
      //   return evaluateSequence(expr);
    }
  }

  private static evaluateLogical(expr: Logical, topLevelExpressions: Expr[]): any {
    const left = this.evaluate(expr.left, topLevelExpressions);

    if (expr.operator.type == TokenType.PIPE) {
      if (isTruthy(left)) return left;
    } else {
      if (!isTruthy(left)) return left;
    }

    return this.evaluate(expr.right, topLevelExpressions);
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
    return this.findDeclaration(expr.name.lexeme, topLevelExpressions);
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
