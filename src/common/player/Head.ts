import {AstNodeKind, Call, Control, Expr, Jump, Sequence, TernaryCondition, TrackList} from '../parser/Ast';
import {Token, TokenType} from '../scanner/Tokens';
import {Player} from './Player';
import {Interpreter} from './Interpreter';

let LATEST_ID = 0;

export class Head {
  public readonly id: string;

  private _currentSequence: Sequence;
  private _currentRootDeclarationName: string;
  private _currentStepIndex: number;
  private _nextTime: number;
  private _stepLength: number;
  private _environments: any[] = [];

  private constructor(id: string,
                      public readonly player: Player,
                      private readonly _parentHead: Head,
                      private _ended: Function) {
    this.id = id + (LATEST_ID++);
    this._nextTime = _parentHead?._nextTime ?? 0;
    this._stepLength = _parentHead?._stepLength ?? 1;
  }

  public get env(): any {
    const parentEnv = this._parentHead == null ? this.player.rootEnv() : this._parentHead.env;
    return this._environments.reduce((acc, env) => ({ ...acc, ...env }), parentEnv);
  }

  public static start(player: Player,
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
        return Interpreter.paramsToMessage(track.params, this.env);
      } else {
        return {};
      }
    });

    this.player.post(this._nextTime, this.id, messages);
  }

  private jump(jump: Jump): void {
    // TODO Outer jump (what is the flag scope ? what if more than 1 ? what if in inner ?)
    // TODO "recursive search" ?
    const targetFlagName = jump.flag.lexeme;
    const freshlyParsedRootSequence = this.player.findDeclaration(this._currentRootDeclarationName);

    if (freshlyParsedRootSequence) {
      this.findFlagAndJump(freshlyParsedRootSequence.value, targetFlagName);
    } else {
      const flag = this._currentSequence.expressions.find(step => step.kind === AstNodeKind.FLAG
        && step.name.lexeme === jump.flag.lexeme);

      if (flag != null) {
        this._currentStepIndex = this._currentSequence.expressions.indexOf(flag);
      }
    }

    this.readNextStep();
  }

  private findFlagAndJump(expr: Expr, targetFlagName: string): boolean {
    switch (expr.kind) {
      case AstNodeKind.SEQUENCE:
        for (const stepExpr of expr.expressions) {
          if (stepExpr.kind === AstNodeKind.FLAG && stepExpr.name.lexeme === targetFlagName) {
            this._currentSequence = expr;
            this._currentStepIndex = this._currentSequence.expressions.indexOf(stepExpr);
            return true;
          }
        }
        break;
    }

    return false;
  }

  private readRootSequence(name: string): void {
    const match = this.player.findDeclaration(name);

    if (match) {
      this._currentRootDeclarationName = name;
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
      case TokenType.DOUBLE_AMPERSAND:
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
            this.player.speed = Interpreter.evaluateAsPrimitive(param.value, this.env);
          }
        }
      });
    } else if (message.target.lexeme === 'head') {
      message.params.forEach(param => {
        if (param.kind === AstNodeKind.PARAM) {
          if (param.assignee.lexeme === 'stepDuration') {
            this._stepLength = Interpreter.evaluateAsPrimitive(param.value, this.env);
          }
        }
      });
    }

    this.readNextStep();
  }

  private readTernary(expr: TernaryCondition): void {
    if (Interpreter.evaluateAsPrimitive(expr.condition, this.env)) {
      this.readSequence(expr.ifBranch);
    } else {
      this.readSequence(expr.elseBranch);
    }
  }

  private readParametrizedSequence(expr: Call): void {
    const message = Interpreter.paramsToMessage(expr.args, this.env);
    this._environments.push(message);
    this.readSequence(expr.callee);
  }
}
