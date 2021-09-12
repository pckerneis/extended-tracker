import {Parser} from '../parser/Parser';
import {Scanner} from '../scanner/Scanner';
import {Assign, AstNodeKind, Expr} from '../parser/Ast';
import {EventQueue} from '../scheduler/EventQueue';
import {Head} from './Head';
import {Interpreter} from './Interpreter';

export interface CodeProvider {
  code: string;
}

export interface MessageProcessor {
  process?: (time: number, headId: string, messages: any[]) => void;
  headEnded?: (headId: string) => void;
  ended?: () => void;
  stopped?: () => void;
}

export interface PlayerOptions {
  codeProvider: CodeProvider,
  entryPoint: string,
  processors: MessageProcessor[];
  clockFn: () => number;
}

export class Player {
  protected _lookAhead: number = 0.1;

  private _latestEvaluatedCode: string;
  private _exprs: Expr[];
  private _startTime: number;
  private _hasReachedEnd: boolean;
  private readonly _eventQueue = new EventQueue<Function>();
  private _speed: number = 1;
  private _stopped: boolean = true;
  private _intervalMs: number = 10;

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
      try {
        this._exprs = Parser.parse(Scanner.scan(this.codeProvider.code));
      } catch(e) {
        console.error(e);
      }
    }

    return this._exprs;
  }

  protected constructor(private readonly codeProvider: CodeProvider,
                        private readonly clock: () => number,
                        private readonly _messageProcessors: MessageProcessor[]) {
  }

  public static create(options: PlayerOptions): Player {
    return new Player(options.codeProvider, options.clockFn, options.processors);
  }

  public findDeclaration(name: string): Assign {
    return this.expressions
      .find(expr => expr.kind === AstNodeKind.ASSIGN && expr.assignee.lexeme === name) as Assign;
  }

  private checkRootSequenceType(name: string): Assign {
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

  public start(entryPoint: string): void {
    if (! this._stopped) {
      this.stop();
    }

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
    this._hasReachedEnd = false;
    this._stopped = false;
    this.next();
  }
  
  public stop(): void {
    if (! this._stopped) {
      this._stopped = true;
      this._messageProcessors
        .filter(processor => typeof processor.stopped === 'function')
        .forEach(processor => processor.stopped());
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

  public rootEnv(): any {
    const builtins = {
      randf: () => Math.random(),
    };

    return this.expressions.reduce((acc, curr) => {
      if (curr.kind === AstNodeKind.ASSIGN) {
        acc[curr.assignee.lexeme] = Interpreter.evaluateAsPrimitive(curr.value, builtins);
      }
      return acc;
    }, builtins);
  }

  private next(): void {
    if (this._stopped) {
      return;
    }

    const now = this.clock() - this._startTime;
    let next: Function;

    do {
      next = this._eventQueue.next(now + this._lookAhead)?.event;

      if (next) {
        next();
      }
    } while (next);

    if (!this._hasReachedEnd) {
      setTimeout(() => this.next(), this._intervalMs);
    }
  }
}
