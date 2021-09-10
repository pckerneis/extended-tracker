import {Scheduler} from '../scheduler/Scheduler';
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
import {TokenType} from '../scanner/Tokens';

export interface CodeProvider {
  code: string;
}

interface MessageOutlet {
  post(time: number, message: any): void;
}

export class Head {

  // private _next: Expr;
  private _currentSequence: Sequence;
  private _currentStepIndex: number;
  private _ended: Function;
  private _nextTime: number;
  private _stepLength: number;

  // TODO Construct with static method, lock constructor...
  constructor(public readonly player: Player,
              public readonly messageOutlet: MessageOutlet) {
  }

  public start(sequenceName: string, nextTime: number, stepLength: number, ended: Function): void {
    this._nextTime = nextTime;
    this._ended = ended;
    this._stepLength = stepLength;

    const match = this.findDeclaration(sequenceName);

    if (match) {
      switch (match.value.kind) {
        case AstNodeKind.SEQUENCE:
          this._currentSequence = match.value;
          this._currentStepIndex = -1;
          break;
        default:
          throw new Error('Not a sequence.');
      }
    } else {
      throw new Error('Cannot find entry point.');
    }
  }

  public next(time: number): boolean {
    if (this._nextTime > time
      || this._currentSequence == null
      || this._currentStepIndex >= this._currentSequence.expressions.length) {
      console.log('exit for time ' + time)
      return false;
    }

    this.readNextStep();
    return true;
  }

  private wait(): void {
    this._nextTime += this._stepLength;
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
      default:
        this.readNextStep();
    }
  }

  private readTracks(step: TrackList): void {
    step.tracks.forEach(track => {
      const message = {};

      if (track.kind === AstNodeKind.PARAMS) {
        track.params.forEach(param => {
          if (param.kind === AstNodeKind.PARAM) {
            message[param.assignee.lexeme] = evaluateAsPrimitive(param.value, {});
          }
        });
      }

      this.messageOutlet.post(this._nextTime, message);
    });
  }

  private jump(jump: Jump): void {
    // TODO outer flag

    // TODO "recursive search"
    const flag = this._currentSequence.expressions.find(step => step.kind === AstNodeKind.FLAG
      &&  step.name.lexeme === jump.flag.lexeme);

    if (flag != null) {
      this._currentStepIndex = this._currentSequence.expressions.indexOf(flag);
      console.log('jump to ' + jump.flag.lexeme);
    }

    this.readNextStep();
  }
}

export class Player {
  private _scheduler: Scheduler = new Scheduler();
  private _speed: number = 1;
  private _latestEvaluatedCode: string;
  private _exprs: Expr[];

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

  private constructor(private readonly codeProvider: CodeProvider) {
  }

  public static read(codeProvider: CodeProvider, entryPoint: string): void {
    const player = new Player(codeProvider);
    player.start(entryPoint);
  }

  private start(entryPoint: string): void {
    const head = new Head(this, { post: (t, message) => console.log(t, message) });
    head.start(entryPoint, 0, 1, () => console.log('ended'));

    while(head.next(10)) {}
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
