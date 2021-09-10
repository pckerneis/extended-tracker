import {Parser} from '../parser/Parser';
import {Scanner} from '../scanner/Scanner';
import {
  Assign,
  AstNodeKind,
  Binary,
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

interface MessageOutlet {
  post(time: number, headId: string, messages: any[]): void;
}

export class Head {
  private _currentSequence: Sequence;
  private _currentStepIndex: number;
  private _ended: Function;
  private _nextTime: number;
  private _stepLength: number;

  private constructor(public readonly id: string,
                      public readonly player: BasePlayer,
                      public readonly messageOutlet: MessageOutlet) {
  }

  public static start(player: BasePlayer,
                      messageOutlet: MessageOutlet,
                      sequenceName: string,
                      stepLength: number,
                      ended: Function): void {
    const head = new Head('root', player, messageOutlet);
    head._nextTime = 0;
    head._ended = ended;
    head._stepLength = stepLength;

    const match = head.findDeclaration(sequenceName);

    if (! match) {
      throw new Error('Cannot find entry point.');
    }

    head.readRootSequence(sequenceName);
  }

  private wait(): void {
    this._nextTime += this._stepLength;

    this.player.schedule(this._nextTime, () => this.readNextStep());
  }

  private findDeclaration(name: string): Assign {
    return this.player.expressions
      .find(expr => expr.kind === AstNodeKind.ASSIGN && expr.assignee.lexeme === name) as Assign;
  }

  private readNextStep(): void {
    if (!this._currentSequence) {
      this._ended();
      return;
    }

    this._currentStepIndex++;

    if (this._currentStepIndex >= this._currentSequence.expressions.length) {
      this._ended();
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
        this.readSequence(step.maybeSequence);
        break;
      default:
        this.readNextStep();
    }
  }

  private readTracks(step: TrackList): void {
    const messages = step.tracks.map(track => {
      const message = {};

      if (track.kind === AstNodeKind.PARAMS) {
        track.params.forEach(param => {
          if (param.kind === AstNodeKind.PARAM) {
            message[param.assignee.lexeme] = evaluateAsPrimitive(param.value, {});
          }
        });
      }

      return message;
    });

    this.messageOutlet.post(this._nextTime, this.id, messages);
  }

  private jump(jump: Jump): void {
    // TODO "recursive search" ?
    const flag = this._currentSequence.expressions.find(step => step.kind === AstNodeKind.FLAG
      &&  step.name.lexeme === jump.flag.lexeme);

    if (flag != null) {
      this._currentStepIndex = this._currentSequence.expressions.indexOf(flag);
    }

    this.readNextStep();
  }

  private readRootSequence(name: string): void {
    const match = this.findDeclaration(name);

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

      if (! rightEnded) {
        this._nextTime = leftHead._nextTime;
        this.readNextStep();
      }
    });

    const rightHead = Head.nested('right', this, right, () => {
      rightEnded = true;

      if (! leftEnded) {
        this._nextTime = rightHead._nextTime;
        this.readNextStep();
      }
    });
  }

  private static nested(id: string, parent: Head, expr: Expr, ended: () => void): Head {
    const head = new Head(`${parent.id}/${id}`, parent.player, parent.messageOutlet);
    head._nextTime = parent._nextTime;
    head._stepLength = parent._stepLength;
    head._ended = ended;
    head.readSequence(expr);
    return head;
  }
}

export class BasePlayer {

  protected _lookAhead: number = 0.1;

  private _speed: number = 1;
  private _latestEvaluatedCode: string;
  private _exprs: Expr[];
  private _startTime: number;
  private _ended: boolean;
  private readonly _eventQueue = new EventQueue<Function>();

  set speed(speed: number) {
    if (!isNaN(speed) && speed > 0) {
      this._speed = speed;
    } else {
      // TODO use error reporter?
      console.error('Wrong speed value ' + speed);
    }
  }

  public get expressions(): Expr[] {
    if (this.codeProvider.code !== this._latestEvaluatedCode) {
      this._latestEvaluatedCode = this.codeProvider.code;
      this._exprs = Parser.parse(Scanner.scan(this.codeProvider.code));
    }

    return this._exprs;
  }

  get speed(): number {
    return this._speed;
  }

  protected constructor(private readonly codeProvider: CodeProvider,
                        private readonly clock: () => number) {
  }

  protected start(entryPoint: string, messageOutlet: MessageOutlet, onEnded: Function): void {
    Head.start(this, messageOutlet,
      entryPoint, 1, () => {
        console.log('ended');
        this._ended = true;
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

    if (! this._ended) {
      setTimeout(() => this.next(), 10);
    }
  }

  public schedule(when: number, what: () => void): void {
    this._eventQueue.add(when, what);
  }
}

export class PrintPlayer extends BasePlayer {
  constructor(codeProvider: CodeProvider, clock: () => number) {
    super(codeProvider, clock);
  }

  public static read(codeProvider: CodeProvider, entryPoint: string, clock: () => number = defaultClock): void {
    const player = new PrintPlayer(codeProvider, clock);
    player.start(entryPoint,
      { post: (t, head, message) => console.log(t, head, message) },
      () => console.log('Ended'));
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

const { performance } = require('perf_hooks');

export function defaultClock(): number {
  return performance.now() / 1000;
}
