import {Token, TokenType} from '../scanner/Tokens';
import {AstNodeKind, Control, Expr, Flag, Jump, SequenceFlagRef} from './Ast';
import {ErrorReporter} from '../error/ErrorReporter';

export class ParseResult {

  private constructor(
    readonly expressions: Expr[],
    readonly hasError: boolean,
    readonly error?: any) {
  }

  public static OK(expressions: Expr[]): ParseResult {
    return new ParseResult(expressions, false);
  }

  public static fromError(error: any): ParseResult {
    return new ParseResult([], true, error);
  }


}

export class Parser {
  private current: number = 0;

  private readonly sequenceStartToken = TokenType.LEFT_BRACKET;
  private readonly sequenceEndToken = TokenType.RIGHT_BRACKET;

  private readonly innerSequenceStartToken = TokenType.LEFT_BRACE;
  private readonly innerSequenceEndToken = TokenType.RIGHT_BRACE;

  private readonly stepSeparators = [TokenType.SEMICOLON, TokenType.NEW_LINE];

  private readonly trackSeparator = TokenType.PIPE;
  private readonly paramSeparator = TokenType.COMMA;

  private readonly flagToken = TokenType.DASH;
  private readonly jumpToken = TokenType.AT;

  private readonly silenceToken = TokenType.MINUS;

  private readonly controlMessageToken = TokenType.DOLLAR;

  private currentDeclarationName: string;
  private readonly registeredFlags = new Map<string, string[]>();

  private constructor(public readonly tokens: Token[]) {
  }

  public static parse(tokens: Token[], code: string, errorReporter: ErrorReporter): ParseResult {
    const parser = new Parser(tokens);
    try {
      return ParseResult.OK(parser.doParse());
    } catch (e) {
      if (e instanceof ParseError) {
        errorReporter.reportError(prettyPrintParseError(e, code));
      } else {
        errorReporter.reportError(e);
      }

      return ParseResult.fromError(e);
    }
  }

  private doParse(): Expr[] {
    if (this.tokens.length === 0) {
      return [];
    }

    return this.parseDeclarations();
  }

  private parseDeclarations(): Expr[] {
    this.consumeNewLines();

    const expressions: Expr[] = [];

    while (!this.reachedEnd()) {
      expressions.push(this.assignment());
    }

    return expressions;
  }

  private assignment(): Expr {
    this.consumeNewLines();

    const identifier = this.consume([TokenType.IDENTIFIER], 'Expect identifier');
    this.currentDeclarationName = identifier.lexeme;

    const params: Token[] = [];

    if (this.match(TokenType.LEFT_PAREN)) {
      if (!this.match(TokenType.RIGHT_PAREN)) {
        do {
          params.push(this.consume([TokenType.IDENTIFIER], 'Expect parameter name'));
        } while (this.match(TokenType.COMMA));

        this.consume([TokenType.RIGHT_PAREN], `Expect "${TokenType.RIGHT_PAREN}" after parameters`);
      }
    }

    this.consumeNewLines();
    const equals = this.consume([TokenType.EQUAL], `Expect "${TokenType.EQUAL}" after identifier`);
    this.consumeNewLines();

    const value = this.expression();


    return {
      kind: AstNodeKind.ASSIGN,
      assignee: identifier,
      equals,
      value,
      params,
    };
  }

  private expression(): Expr {
    this.consumeNewLines();
    return this.ternary(); // TODO Check precedence
  }

  private sequence(): (Expr | null)[] {
    this.consumeNewLines();

    let expressions: Expr[] = [];

    if (!this.match(this.sequenceEndToken)) {
      expressions = this.parseSequenceSteps();
      this.consumeNewLines();
      this.consume([this.sequenceEndToken], `Expect '${this.sequenceEndToken}' after sequence`);
    }

    return expressions;
  }

  private parseSequenceSteps(): Expr[] {
    const expressions: Expr[] = [];

    do {
      this.consumeNewLines();

      if (this.check(this.sequenceEndToken)) {
        break;
      }

      if (this.match(this.controlMessageToken)) {
        expressions.push(this.controlMessage())
      } else if (this.match(this.jumpToken)) {
        expressions.push(this.jump());
      } else if (this.match(this.flagToken)) {
        expressions.push(this.flag());
      } else if (this.match(this.innerSequenceStartToken)) {
        if (!this.check(this.innerSequenceEndToken)) {
          expressions.push(this.innerSequence());
        }
      } else {
        const trackList = this.trackList();

        expressions.push({
          kind: AstNodeKind.TRACKS,
          tracks: trackList,
        });
      }
    } while (this.match(...this.stepSeparators));

    this.consumeNewLines();

    return expressions;
  }

  private trackList(): Expr[] {
    const tracks: Expr[] = [];

    do {
      if (this.check(TokenType.NEW_LINE)) {
        break;
      }

      if (this.check(this.trackSeparator)) {
        tracks.push({
          kind: AstNodeKind.PARAMS,
          params: [],
        });

        continue;
      }

      const params: Expr[] = [];

      params.push(...this.paramList(TokenType.NEW_LINE, TokenType.PIPE));

      tracks.push({
        kind: AstNodeKind.PARAMS,
        params,
      });
    } while (this.match(this.trackSeparator));

    return tracks;
  }

  private paramList(...closingTokens: TokenType[]): Expr[] {
    const expressions: Expr[] = [];

    do {
      if (this.check(...closingTokens)) {
        break;
      }

      if (this.match(this.paramSeparator)) {
        expressions.push({kind: AstNodeKind.EMPTY_PARAM});

        while (this.check(this.paramSeparator)) {
          this.advance();
        }

        continue;
      }

      const parsed = this.param(closingTokens);
      if (parsed != null) {
        expressions.push(parsed);
      }
    } while (this.match(this.paramSeparator));

    return expressions;
  }

  private param(closingTokens: TokenType[]): Expr {
    const expr = this.primary();

    if (expr.kind === 'VARIABLE') {
      const name = expr.name;

      if (this.match(TokenType.COLON)) {
        const colon = this.previous();
        const value = this.expression();

        return {
          kind: AstNodeKind.PARAM,
          assignee: name,
          colon,
          value,
        };
      } else if ([this.paramSeparator, this.trackSeparator, ...this.stepSeparators, ...closingTokens].includes(this.peek().type)) {
        return {
          kind: AstNodeKind.PARAM,
          assignee: name,
          colon: null,
          value: null,
        };
      }
    }

    throw new ParseError(this.previous(), 'Invalid parameter name');
  }

  private innerSequence(): Expr {
    const startToken = this.previous();
    const maybeSequence = this.expression();
    this.consume([this.innerSequenceEndToken], `Expect ${this.innerSequenceEndToken} after a inner sequence`);
    const endToken = this.previous();

    return {
      kind: AstNodeKind.INNER_SEQUENCE,
      startToken, endToken,
      maybeSequence,
    };
  }

  private ternary(): Expr {
    const expr = this.or();

    if (this.match(TokenType.CONDITIONAL)) {
      const condOp = this.previous();
      const ifBranch = this.expression();

      this.consume([TokenType.COLON], 'Expected \':\' after if branch');
      const elseOp = this.previous();
      const elseBranch = this.expression();

      return {
        kind: AstNodeKind.TERNARY_COND,
        condition: expr,
        ifBranch, elseBranch,
        operators: [condOp, elseOp],
      };
    }

    return expr;
  }

  private or(): Expr {
    let expr = this.and();

    while (this.match(TokenType.DOUBLE_PIPE)) {
      const operator: Token = this.previous();
      const right: Expr = this.and();
      expr = {kind: AstNodeKind.LOGICAL, left: expr, operator, right};
    }

    return expr;
  }

  private and(): Expr {
    let expr = this.equality();

    while (this.match(TokenType.DOUBLE_AMPERSAND)) {
      const operator: Token = this.previous();
      const right: Expr = this.equality();
      expr = {kind: AstNodeKind.LOGICAL, left: expr, operator, right};
    }

    return expr;
  }

  private equality(): Expr {
    let expr: Expr = this.comparison();

    while (this.match(TokenType.BANG_EQUAL, TokenType.EQUAL_EQUAL)) {
      const operator: Token = this.previous();
      const right: Expr = this.comparison();
      expr = {kind: AstNodeKind.BINARY, left: expr, operator, right};
    }

    return expr;
  }

  private comparison(): Expr {
    let expr: Expr = this.addition();

    while (this.match(
      TokenType.GREATER, TokenType.GREATER_EQUAL,
      TokenType.LESS, TokenType.LESS_EQUAL,
      TokenType.LEFT_LEFT, TokenType.RIGHT_RIGHT)) {
      const operator: Token = this.previous();
      const right: Expr = this.addition();
      expr = {kind: AstNodeKind.BINARY, left: expr, operator, right};
    }

    return expr;
  }

  private addition(): Expr {
    let left: Expr = this.multiplication();

    while (this.match(TokenType.MINUS, TokenType.PLUS)) {
      const operator: Token = this.previous();
      const right: Expr = this.multiplication();
      left = {kind: AstNodeKind.BINARY, left, operator, right};
    }

    return left;
  }

  private multiplication(): Expr {
    let expr: Expr = this.unary();

    while (this.match(TokenType.SLASH, TokenType.STAR)) {
      const operator: Token = this.previous();
      const right: Expr = this.unary();
      expr = {kind: AstNodeKind.BINARY, left: expr, operator, right};
    }

    return expr;
  }

  private unary(): Expr {
    if (this.match(TokenType.BANG, TokenType.MINUS)) {
      const operator: Token = this.previous();
      const right: Expr = this.unary();
      return {kind: AstNodeKind.RL_UNARY, operator, right};
    }

    return this.call();
  }

  private call(): Expr {
    let expr = this.primary();

    while (true) {
      if (this.match(TokenType.LEFT_PAREN)) {
        expr = this.finishCall(expr);
      } else {
        break;
      }
    }

    return expr;
  }

  private finishCall(callee: Expr): Expr {
    const leftParen = this.previous();
    const args: Expr[] = this.paramList(TokenType.RIGHT_PAREN);
    const rightParen: Token = this.consume([TokenType.RIGHT_PAREN], 'Expect ")" after arguments');

    return {
      kind: AstNodeKind.CALL,
      parenTokens: [leftParen, rightParen],
      args,
      callee
    }
  }

  private primary(): Expr {
    if (this.match(TokenType.NUMBER, TokenType.STRING, TokenType.TRUE, TokenType.FALSE))
      return {kind: AstNodeKind.LITERAL, value: this.previous().literal, token: this.previous()};

    if (this.match(TokenType.LEFT_PAREN)) {
      const expr: Expr = this.expression();
      this.consume([TokenType.RIGHT_PAREN], 'Expect \')\' after expression');
      return {kind: AstNodeKind.GROUPING, expr};
    }

    if (this.match(TokenType.IDENTIFIER, this.silenceToken)) {
      if (this.peek().type === TokenType.DASH) {
        return this.sequenceFlagRef();
      }

      return {kind: AstNodeKind.VARIABLE, name: this.previous()};
    }

    if (this.match(this.sequenceStartToken)) {
      const startToken = this.previous();
      this.consumeNewLines();
      const sequence = this.sequence();
      const endToken = this.previous();

      this.consumeNewLines();

      return {
        kind: AstNodeKind.SEQUENCE,
        expressions: sequence,
        startToken, endToken,
      };
    }

    const peek = this.peek();
    throw new ParseError(peek, 'Expect expression');
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }

    return false;
  }

  private check(...types: TokenType[]): boolean {
    if (!types.includes(TokenType.EOF) && this.reachedEnd()) return false;
    return types.includes(this.peek().type);
  }

  private advance(): Token {
    if (!this.reachedEnd()) this.current++;
    return this.previous();
  }

  private reachedEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private consume(types: TokenType[], message: string): Token {
    if (this.check(...types)) return this.advance();

    throw new ParseError(this.peek(), message);
  }

  private consumeNewLines(): void {
    while (this.check(TokenType.NEW_LINE))
      this.advance();
  }

  private jump(): Jump {
    const jumpToken = this.previous();

    if (this.match(TokenType.IDENTIFIER)) {
      const sequenceOrFlagName = this.previous()

      if (this.match(this.flagToken)) {
        const flagToken = this.previous();

        if (this.match(TokenType.IDENTIFIER)) {
          const outerFlagName = this.previous();

          return {
            kind: AstNodeKind.JUMP,
            jumpToken,
            sequence: sequenceOrFlagName,
            flag: outerFlagName,
            flagToken,
          };
        } else {
          return {
            kind: AstNodeKind.JUMP,
            jumpToken,
            sequence: sequenceOrFlagName,
            flag: null,
            flagToken,
          };
        }
      } else {
        return {
          kind: AstNodeKind.JUMP,
          jumpToken,
          sequence: null,
          flag: sequenceOrFlagName,
          flagToken: null,
        };
      }
    } else {
      throw new Error('Expected flag name after ' + this.jumpToken);
    }
  }

  private controlMessage(): Control {
    const token = this.previous();
    const target = this.consume([TokenType.IDENTIFIER], 'Expect target name after control message operator');
    const params = this.paramList();

    return {
      kind: AstNodeKind.CONTROL_MESSAGE,
      token,
      target,
      params,
    };
  }

  private flag(): Flag {
    const flagToken = this.previous();

    if (this.match(TokenType.IDENTIFIER)) {
      const name = this.previous();
      this.registerFlagForCurrentSequence(name);

      return {
        kind: AstNodeKind.FLAG,
        flagToken,
        name,
      };
    } else {
      throw new Error('Expected flag name after ' + this.flagToken);
    }
  }

  private sequenceFlagRef(): SequenceFlagRef {
    const sequenceName = this.previous();
    let flagToken: Token;
    let flagName: Token;

    if (this.match(this.flagToken)) {
      flagToken = this.previous();
      flagName = this.consume([TokenType.IDENTIFIER], 'Expect a flag name.');
    }

    return {
      kind: AstNodeKind.SEQUENCE_FLAG_REF,
      sequenceName,
      flagName,
      flagToken,
    };
  }

  private registerFlagForCurrentSequence(flagNameToken: Token): void {
    const flagName = flagNameToken.lexeme;
    const currentFlags = this.registeredFlags.get(this.currentDeclarationName) ?? [];

    if (currentFlags.includes(flagName)) {
      throw new ParseError(
        flagNameToken,
        `A flag named "${flagName}" was already registered with within declaration "${this.currentDeclarationName}"`);
    }

    const flags = [...currentFlags, flagName];
    this.registeredFlags.set(this.currentDeclarationName, flags);
  }
}

class ParseError extends Error {
  constructor(public readonly token: Token,
              message: string) {
    super(message);
  }
}

function prettyPrintParseError(error: ParseError, code: string): string {
  const {message, token} = error;
  const maxContextLength = 30;
  const tokenStart = token.position.column;

  let context = code.split('\n')[token.position.line];
  let startOffset = 0;

  if (context.length > maxContextLength) {
    const start = Math.max(0, tokenStart - maxContextLength / 2);
    const end = Math.min(tokenStart + (maxContextLength / 2), context.length);
    startOffset = Math.ceil(Math.min(start, end - maxContextLength));
    context = context.slice(startOffset, Math.ceil(Math.max(end, start + maxContextLength)));
  }

  const pointer = new Array(tokenStart - startOffset).fill(' ').join('') + '^';

  return `ParseError: ${message}
       at line ${token.position.line + 1}, column ${tokenStart}:
       ${context}
       ${pointer}`;
}

