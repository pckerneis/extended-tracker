import {Token, TokenType} from '../scanner/tokens';
import {Expr, Kind} from './Ast';

export class Parser {
  private current: number = 0;

  private readonly sequenceStartOperator = TokenType.LEFT_BRACKET;
  private readonly sequenceEndOperator = TokenType.RIGHT_BRACKET;
  private readonly sequenceSeparators = [TokenType.SEMICOLON, TokenType.NEW_LINE];

  private readonly trackSeparator = TokenType.PIPE;
  private readonly paramSeparator = TokenType.COMMA;

  private readonly flagToken = TokenType.DASH;
  private readonly jumpToken = TokenType.AT;

  private readonly silenceToken = TokenType.MINUS;

  constructor(public readonly tokens: Token[]) {
  }

  public static parse(tokens: Token[]): Expr[] {
    const scanner = new Parser(tokens);
    return scanner.doParse();
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

    const expr = this.ternary();

    this.consumeNewLines();

    if (this.match(TokenType.EQUAL)) {
      this.consumeNewLines();

      const equals = this.previous();

      if (expr.kind === 'VARIABLE') {
        const value = this.expression();
        const name = expr.name;

        return {
          kind: Kind.ASSIGN,
          assignee: name,
          equals,
          value,
        };
      } else {
        throw new ParseError(equals, 'Invalid assignment target');
      }
    }

    return expr;
  }

  private sequence(): (Expr | null)[] {
    this.consumeNewLines();

    let expressions: Expr[] = [];

    if (!this.check(this.sequenceEndOperator)) {
      expressions = this.parseSequenceSteps();
    }

    this.consumeNewLines();

    this.consume([this.sequenceEndOperator], `Expect '${this.sequenceEndOperator}' after sequence`);

    return expressions;
  }

  private parseSequenceSteps(): Expr[] {
    const expressions: Expr[] = [];

    do {
      this.consumeNewLines();

      if (this.check(this.sequenceEndOperator)) {
        break;
      }

      if (this.match(this.jumpToken)) {
        const jumpToken = this.previous();

        if (this.match(TokenType.IDENTIFIER)) {
          expressions.push({
            kind: Kind.JUMP,
            jumpToken,
            name: this.previous(),
          });
        } else {
          throw new Error('Expected flag name after ' + this.jumpToken);
        }
      } else if (this.match(this.flagToken)) {
        const flagToken = this.previous();

        if (this.match(TokenType.IDENTIFIER)) {
          expressions.push({
            kind: Kind.FLAG,
            flagToken,
            name: this.previous(),
          });
        } else {
          throw new Error('Expected flag name after ' + this.flagToken);
        }
      } else {
        const trackList = this.trackList();

        expressions.push({
          kind: Kind.TRACKS,
          tracks: trackList,
        });
      }
    } while (this.match(...this.sequenceSeparators));

    this.consumeNewLines();

    return expressions;
  }

  private trackList(): Expr[] {
      const tracks: Expr[] = [];

      do {
        if (this.check(TokenType.NEW_LINE)) {
          break;
        }

        const params: Expr[] = [];

        if (this.match(this.silenceToken)) {
          params.push({
            kind: Kind.SILENCE,
            token: this.previous()
          });

          this.match(this.paramSeparator);
        }

        params.push(...this.paramList());

        tracks.push({
          kind: Kind.PARAMS,
          params,
        });
      } while (this.match(this.trackSeparator));

      return tracks;
  }

  private paramList(): Expr[] {
    const expressions: Expr[] = [];

    do {
      if (this.check(TokenType.NEW_LINE, TokenType.PIPE)) {
        break;
      }

      const parsed = this.param();
      if (parsed != null) {
        expressions.push(parsed);
      }
    } while (this.match(this.paramSeparator));

    return expressions;
  }

  private param(): Expr {
    const expr = this.primary();

    if (this.match(TokenType.COLON)) {
      const colon = this.previous();

      if (expr.kind === 'VARIABLE') {
        const value = this.expression();
        const name = expr.name;

        return {
          kind: Kind.PARAM,
          assignee: name,
          colon,
          value,
        };
      } else {
        throw new ParseError(colon, 'Invalid parameter name');
      }
    }

    return expr;
  }

  private expression(): Expr {
    this.consumeNewLines();

    if (this.match(this.sequenceStartOperator)) {
      const startToken = this.previous();
      this.consumeNewLines();
      const sequence = this.sequence();
      const endToken = this.previous();

      this.consumeNewLines();

      return {
        kind: Kind.SEQUENCE,
        expressions: sequence,
        startToken, endToken,
      }
    }

    return this.ternary();
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
        kind: Kind.TERNARY_COND,
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
      expr = {kind: Kind.LOGICAL, left: expr, operator, right};
    }

    return expr;
  }

  private and(): Expr {
    let expr = this.equality();

    while (this.match(TokenType.AMPERSAND)) {
      const operator: Token = this.previous();
      const right: Expr = this.equality();
      expr = {kind: Kind.LOGICAL, left: expr, operator, right};
    }

    return expr;
  }

  private equality(): Expr {
    let expr: Expr = this.comparison();

    while (this.match(TokenType.BANG_EQUAL, TokenType.EQUAL_EQUAL)) {
      const operator: Token = this.previous();
      const right: Expr = this.comparison();
      expr = {kind: Kind.BINARY, left: expr, operator, right};
    }

    return expr;
  }

  private comparison(): Expr {
    let expr: Expr = this.addition();

    while (this.match(TokenType.GREATER, TokenType.GREATER_EQUAL, TokenType.LESS, TokenType.LESS_EQUAL)) {
      const operator: Token = this.previous();
      const right: Expr = this.addition();
      expr = {kind: Kind.BINARY, left: expr, operator, right};
    }

    return expr;
  }

  private addition(): Expr {
    let left: Expr = this.multiplication();

    while (this.match(TokenType.MINUS, TokenType.PLUS)) {
      const operator: Token = this.previous();
      const right: Expr = this.multiplication();
      left = {kind: Kind.BINARY, left, operator, right};
    }

    return left;
  }

  private multiplication(): Expr {
    let expr: Expr = this.unary();

    while (this.match(TokenType.SLASH, TokenType.STAR)) {
      const operator: Token = this.previous();
      const right: Expr = this.unary();
      expr = {kind: Kind.BINARY, left: expr, operator, right};
    }

    return expr;
  }

  private unary(): Expr {
    if (this.match(TokenType.BANG, TokenType.MINUS)) {
      const operator: Token = this.previous();
      const right: Expr = this.unary();
      return {kind: Kind.RL_UNARY, operator, right};
    }

    return this.primary();
  }

  private primary(): Expr {
    if (this.match(TokenType.NUMBER, TokenType.STRING))
      return {kind: Kind.LITERAL, value: this.previous().literal, token: this.previous()};

    if (this.match(TokenType.LEFT_PAREN)) {
      const expr: Expr = this.expression();
      this.consume([TokenType.RIGHT_PAREN], 'Expect \')\' after expression');
      return {kind: Kind.GROUPING, expr};
    }

    if (this.match(TokenType.IDENTIFIER)) {
      return {kind: Kind.VARIABLE, name: this.previous()};
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
}

class ParseError extends Error {
  constructor(public readonly token: Token,
              message: string) {
    super(`${message} at [${token.position.line}:${token.position.column}]`);
  }
}
