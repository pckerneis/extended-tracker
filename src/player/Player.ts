import {Parser} from '../parser/Parser';
import {Scanner} from '../scanner/Scanner';
import {
  Assign,
  AstNodeKind,
  Binary,
  Call,
  Control,
  Expr,
  Jump,
  Logical,
  RLUnary,
  Sequence,
  TernaryCondition,
  TrackList
} from '../parser/Ast';
import {Token, TokenType} from '../scanner/Tokens';
import {EventQueue} from '../scheduler/EventQueue';

export interface CodeProvider {
  code: string;
}

export class Head {
  private _currentSequence: Sequence;
  private _currentStepIndex: number;
  private _nextTime: number;
  private _stepLength: number;
  private _environments: any[] = [];

  private constructor(public readonly id: string,
                      public readonly player: BasePlayer,
                      private readonly _parentHead: Head,
                      private _ended: Function) {
    this._nextTime = _parentHead?._nextTime ?? 0;
    this._stepLength = _parentHead?._stepLength ?? 1;
  }

  public get env(): any {
    const parentEnv = this._parentHead == null ? this.player.rootEnv() : this._parentHead.env;
    return this._environments.reduce((acc, env) => ({ ...acc, ...env }), parentEnv);
  }

  public static start(player: BasePlayer,
                      sequenceName: string,
                      stepLength: number,
                      ended: Function): Head {
    const head = new Head('root', player, null, ended);
    head.readRootSequence(sequenceName);
    return head;
  }

  private static nested(id: string, parent: Head, expr: Expr, ended: () => void): Head {
    const head = new Head(`${parent.id}/${id}`, parent.player, parent, ended);
    head.readSequence(expr);
    return head;
  }

  private wait(): void {
    this._nextTime += this._stepLength / this.player.speed;

    this.player.schedule(this._nextTime, () => this.readNextStep());
  }

  private readNextStep(): void {
    if (!this._currentSequence) {
      this.end();
      return;
    }

    this._currentStepIndex++;

    if (this._currentStepIndex >= this._currentSequence.expressions.length) {
      this.end();
      return;
    }
    const step = this._currentSequence.expressions[this._currentStepIndex];

    switch (step.kind) {
      case AstNodeKind.TRACKS:
        this.readTracks(step);
        this.wait();
        return;
      case AstNodeKind.JUMP:
        this.jump(step);
        break;
      case AstNodeKind.INNER_SEQUENCE:
        this.innerSequence(step.maybeSequence);
        break;
      case AstNodeKind.CONTROL_MESSAGE:
        this.controlMessage(step);
        break;
      default:
        this.readNextStep();
    }
  }

  private readTracks(step: TrackList): void {
    const messages = step.tracks.map(track => {
      if (track.kind === AstNodeKind.PARAMS) {
        return paramsToMessage(track.params, this.env);
      } else {
        return {};
      }
    });

    this.player.post(this._nextTime, this.id, messages);
  }

  private jump(jump: Jump): void {
    // TODO Outer jump (what is the flag scope ? what if more than 1 ? what if in inner ?)
    // TODO "recursive search" ?
    const flag = this._currentSequence.expressions.find(step => step.kind === AstNodeKind.FLAG
      && step.name.lexeme === jump.flag.lexeme);

    if (flag != null) {
      this._currentStepIndex = this._currentSequence.expressions.indexOf(flag);
    }

    this.readNextStep();
  }

  private readRootSequence(name: string): void {
    const match = this.player.findDeclaration(name);

    if (match) {
      this.readSequence(match.value);
    }
  }

  private readSequence(expr: Expr): void {
    switch (expr.kind) {
      case AstNodeKind.VARIABLE:
        this.readRootSequence(expr.name.lexeme);
        break;
      case AstNodeKind.SEQUENCE:
        this._currentSequence = expr;
        this._currentStepIndex = -1;
        this.readNextStep();
        break;
      case AstNodeKind.TERNARY_COND:
        this.readTernary(expr);
        break;
      case AstNodeKind.CALL:
        this.readParametrizedSequence(expr);
        break;
      case AstNodeKind.BINARY:
      case AstNodeKind.LOGICAL:
        this.readSequenceOperation(expr.left, expr.right, expr.operator);
        break;
    }
  }

  private readSequenceOperation(left: Expr, right: Expr, operator: Token): void {
    switch (operator.type) {
      case TokenType.AMPERSAND:
        return this.readAll(left, right);
      case TokenType.DOUBLE_PIPE:
        return this.readAny(left, right);
    }
  }

  private readAll(left: Expr, right: Expr): void {
    let leftEnded = false;
    let rightEnded = false;

    const leftHead = Head.nested('left', this, left, () => {
      leftEnded = true;

      if (rightEnded) {
        this._nextTime = leftHead._nextTime;
        this.readNextStep();
      }
    });

    const rightHead = Head.nested('right', this, right, () => {
      rightEnded = true;

      if (leftEnded) {
        this._nextTime = rightHead._nextTime;
        this.readNextStep();
      }
    });
  }

  private readAny(left: Expr, right: Expr): void {
    let leftEnded = false;
    let rightEnded = false;

    const leftHead = Head.nested('left', this, left, () => {
      leftEnded = true;

      if (!rightEnded) {
        this._nextTime = leftHead._nextTime;
        this.readNextStep();
      }
    });

    const rightHead = Head.nested('right', this, right, () => {
      rightEnded = true;

      if (!leftEnded) {
        this._nextTime = rightHead._nextTime;
        this.readNextStep();
      }
    });
  }

  private innerSequence(maybeSequence: Expr): void {
    const nested = Head.nested('nested', this, maybeSequence, () => {
      this._nextTime = nested._nextTime;
      this.readNextStep();
    });
  }

  private end(): void {
    this.player.processors.filter(p => typeof p.headEnded === 'function')
      .forEach(processor => processor.headEnded(this.id));
    this._ended();
  }

  private controlMessage(message: Control): void {
    if (message.target.lexeme === 'player') {
      message.params.forEach(param => {
        if (param.kind === AstNodeKind.PARAM) {
          if (param.assignee.lexeme === 'speed') {
            this.player.speed = evaluateAsPrimitive(param.value, this.env);
          }
        }
      });
    } else if (message.target.lexeme === 'head') {
      message.params.forEach(param => {
        if (param.kind === AstNodeKind.PARAM) {
          if (param.assignee.lexeme === 'stepDuration') {
            this._stepLength = evaluateAsPrimitive(param.value, this.env);
            console.log(this._stepLength);
          }
        }
      });
    }

    this.readNextStep();
  }

  private readTernary(expr: TernaryCondition): void {
    if (evaluateAsPrimitive(expr.condition, this.env)) {
      this.readSequence(expr.ifBranch);
    } else {
      this.readSequence(expr.elseBranch);
    }
  }

  private readParametrizedSequence(expr: Call): void {
    const message = paramsToMessage(expr.args, this.env);
    this._environments.push(message);
    this.readSequence(expr.callee);
  }
}

export interface MessageProcessor {
  process?: (time: number, headId: string, messages: any[]) => void;
  headEnded?: (headId: string) => void;
  ended?: () => void;
}

export class BasePlayer {
  protected _lookAhead: number = 0.1;

  private _latestEvaluatedCode: string;
  private _exprs: Expr[];
  private _startTime: number;
  private _hasReachedEnd: boolean;
  private readonly _eventQueue = new EventQueue<Function>();
  private _messageProcessors: MessageProcessor[] = [];
  private _speed: number = 1;

  public set speed(speed: number) {
    if (speed > 0) {
      this._speed = speed;
    }
  }

  public get speed(): number {
    return this._speed;
  }

  public get processors(): MessageProcessor[] {
    return this._messageProcessors;
  }

  public get expressions(): Expr[] {
    if (this.codeProvider.code !== this._latestEvaluatedCode) {
      this._latestEvaluatedCode = this.codeProvider.code;
      this._exprs = Parser.parse(Scanner.scan(this.codeProvider.code));
    }

    return this._exprs;
  }

  protected constructor(private readonly codeProvider: CodeProvider,
                        private readonly clock: () => number) {
  }

  static read(codeProvider: CodeProvider,
              entryPoint: string,
              processors: MessageProcessor[]) {
    const player = new BasePlayer(codeProvider, defaultClock);
    player._messageProcessors = processors;
    player.start(entryPoint);
  }

  public findDeclaration(name: string): Assign {
    return this.expressions
      .find(expr => expr.kind === AstNodeKind.ASSIGN && expr.assignee.lexeme === name) as Assign;
  }

  public checkRootSequenceType(name: string): Assign {
    const decl = this.findDeclaration(name);

    if (decl === null) {
      throw new Error('Cannot find entry point.');
    }

    const sequenceLikes = [
      AstNodeKind.TERNARY_COND,
      AstNodeKind.BINARY,
      AstNodeKind.LOGICAL,
      AstNodeKind.VARIABLE,
      AstNodeKind.SEQUENCE,
      AstNodeKind.CALL,
    ]

    if (sequenceLikes.includes(decl.value.kind)) {
      return;
    }

    throw new Error('Entry point should evaluate to a sequence.')
  }

  protected start(entryPoint: string): void {
    this.checkRootSequenceType(entryPoint);

    Head.start(this,
      entryPoint,
      1,
      () => {
        this._messageProcessors
          .filter(processor => typeof processor.ended === 'function')
          .forEach(processor => processor.ended());

        this._hasReachedEnd = true;
      });

    this._startTime = this.clock();
    this.next();
  }

  private next(): void {
    const now = this.clock() - this._startTime;
    let next: Function;

    do {
      next = this._eventQueue.next(now + this._lookAhead)?.event;

      if (next) {
        next();
      }
    } while (next);

    if (!this._hasReachedEnd) {
      setTimeout(() => this.next(), 10);
    }
  }

  public schedule(when: number, what: () => void): void {
    this._eventQueue.add(when, what);
  }

  public post(time: number, headId: string, messages: any[]): void {
    this._messageProcessors
      .filter(processor => typeof processor.process === 'function')
      .forEach(processor => processor.process(time, headId, messages));
  }

  rootEnv(): any {
    const builtins = {
      randf: () => Math.random(),
    };

    return this.expressions.reduce((acc, curr) => {
      if (curr.kind === AstNodeKind.ASSIGN) {
        acc[curr.assignee.lexeme] = evaluateAsPrimitive(curr.value, {});
      }
      return acc;
    }, builtins);
  }
}

function evaluateAsPrimitive(expr: Expr, env: any): any {
  if (expr == null) {
    return null;
  }

  switch (expr.kind) {
    case AstNodeKind.VARIABLE:
      return env[expr.name.lexeme];
    case AstNodeKind.LITERAL:
      return expr.value;
    case AstNodeKind.RL_UNARY:
      return evaluateUnary(expr, env);
    case AstNodeKind.BINARY:
      return evaluateBinary(expr, env);
    case AstNodeKind.GROUPING:
      return evaluateAsPrimitive(expr.expr, env);
    case AstNodeKind.TERNARY_COND:
      return evaluateTernaryCondition(expr, env);
    case AstNodeKind.LOGICAL:
      return evaluateLogical(expr, env);
    case AstNodeKind.CALL:
      return evaluateCall(expr, env);
  }
}

function evaluateUnary(expr: RLUnary, env: any): null | any {
  switch (expr.operator.type) {
    case TokenType.BANG:
      return !evaluateAsPrimitive(expr.right, env);
    case TokenType.MINUS:
      return -evaluateAsPrimitive(expr.right, env);
  }
}

function evaluateBinary(expr: Binary, env: any) {
  const left = evaluateAsPrimitive(expr.left, env);
  const right = evaluateAsPrimitive(expr.right, env);

  switch (expr.operator.type) {
    case TokenType.EQUAL_EQUAL:
      return left === right;
    case TokenType.BANG_EQUAL:
      return left !== right;
    case TokenType.GREATER:
      return left > right;
    case TokenType.GREATER_EQUAL:
      return left >= right;
    case TokenType.LESS:
      return left < right;
    case TokenType.LESS_EQUAL:
      return left <= right;
    case TokenType.MINUS:
      return left - right;
    case TokenType.SLASH:
      return left / right;
    case TokenType.STAR:
      return left * right;
    case TokenType.PLUS:
      return left + right;
  }
}

function evaluateTernaryCondition(expr: TernaryCondition, env: any): null | any {
  const predicate = evaluateAsPrimitive(expr.condition, env);

  if (predicate) {
    return evaluateAsPrimitive(expr.ifBranch, env);
  } else {
    return evaluateAsPrimitive(expr.elseBranch, env)
  }
}

function evaluateLogical(expr: Logical, env: any): null | any {
  const left = evaluateAsPrimitive(expr.left, env);
  const right = evaluateAsPrimitive(expr.right, env);

  if (expr.operator.type === TokenType.AMPERSAND) {
    return left && right;
  } else {
    return left || right;
  }
}

function evaluateCall(expr: Call, env: any): any {
  const callee = evaluateAsPrimitive(expr.callee, env);
  const args = paramsToMessage(expr.args, env);

  if (typeof callee === 'function') {
    return callee({...env, ...args});
  }
}

function paramsToMessage(params: Expr[], env: any): {} {
  const msg = {};

  params.forEach(param => {
    if (param.kind === AstNodeKind.PARAM) {
      if (param.value) {
        msg[param.assignee.lexeme] = evaluateAsPrimitive(param.value, env);
      } else {
        msg[param.assignee.lexeme] = env[param.assignee.lexeme];
      }
    }
  });

  return msg;
}

const {performance} = require('perf_hooks');

export function defaultClock(): number {
  return performance.now() / 1000;
}
