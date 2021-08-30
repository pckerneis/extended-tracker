import {operators, Token, TokenType} from './tokens';

export class Scanner {
  private tokens: Token[] = [];

  private current: number = 0;
  private column: number = 0;
  private start: number = 0;
  private line: number = 0;

  private constructor(public readonly source: string) {
    this.source = source;
  }

  public static isAlpha(c: string | null): boolean {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    return typeof c === 'string' && (letters + letters.toUpperCase() + '_').indexOf(c) >= 0;
  }

  public static isDigit(c: string | null): boolean {
    return typeof c === 'string' && '0123456789'.indexOf(c) >= 0;
  }

  public static isAlphaNumeric(c: string | null): boolean {
    return typeof c === 'string' && this.isAlpha(c) || this.isDigit(c);
  }

  public static isOperator(c: string | null): boolean {
    return typeof c === 'string' && operators.indexOf(c) >= 0;
  }

  public static scan(source: string): Token[] {
    const scanner = new Scanner(source);
    return scanner.doScan();
  }

  private doScan(): Token[] {
    this.current = 0;
    this.column = 0;
    this.start = 0;
    this.line = 0;
    this.tokens = [];

    while (!this.endReached()) {
      this.start = this.current;
      this.scanToken();
    }

    this.tokens.push(Token.EOF(this.line));
    return this.tokens;
  }

  private scanToken(): void {
    const c = this.advance();
    // DBG('scanning character ' + c);

    if (c != null && c != '') {
      switch (c) {
        case '"':
          this.string();
          break;
        case '(':
          this.addToken(TokenType.LEFT_PAREN);
          break;
        case ')':
          this.addToken(TokenType.RIGHT_PAREN);
          break;
        case '{':
          this.addToken(TokenType.LEFT_BRACE);
          break;
        case '}':
          this.addToken(TokenType.RIGHT_BRACE);
          break;
        case '[':
          this.addToken(TokenType.LEFT_BRACKET);
          break;
        case ']':
          this.addToken(TokenType.RIGHT_BRACKET);
          break;
        case ',':
          this.addToken(TokenType.COMMA);
          break;
        case '.':
          this.addToken(TokenType.DOT);
          break;
        case '+':
          this.addToken(TokenType.PLUS);
          break;
        case '-':
          this.addToken(TokenType.MINUS);
          break;
        case '*':
          this.addToken(TokenType.STAR);
          break;
        case '/':
          this.addToken(TokenType.SLASH);
          break;
        case '%':
          this.addToken(TokenType.MODULO);
          break;
        case '?':
          this.addToken(TokenType.CONDITIONAL);
          break;
        case '$':
          this.addToken(TokenType.DOLLAR);
          break;
        case '@':
          this.addToken(TokenType.AT);
          break;
        case '&':
          this.addToken(TokenType.AMPERSAND);
          break;
        case ';':
          this.addToken(TokenType.SEMICOLON);
          break;
        case ':':
          this.addToken(TokenType.COLON);
          break;
        case '#':
          this.addToken(TokenType.DASH);
          break;
        case '|':
          this.addToken(this.match('|') ? TokenType.DOUBLE_PIPE : TokenType.PIPE);
          break;
        case '!':
          this.addToken(this.match('=') ? TokenType.BANG_EQUAL : TokenType.BANG);
          break;
        case '=':
          this.addToken(this.match('=') ? TokenType.EQUAL_EQUAL : TokenType.EQUAL);
          break;
        case '<':
          this.addToken(this.match('=') ? TokenType.LESS_EQUAL : TokenType.LESS);
          break;
        case '>':
          this.addToken(this.match('=') ? TokenType.GREATER_EQUAL : TokenType.GREATER);
          break;
        case '\n':
          this.addToken(TokenType.NEW_LINE);
          this.line++;
          this.column = 0;
          break;
        default:
          if (isWhitespace(c)) {
            break;
          }
          if (Scanner.isDigit(c)) {
            this.number();
          } else if (Scanner.isAlpha(c)) {
            this.identifier();
          } else {
            throw new Error(`Unexpected character '${c}' at [${this.line}:${this.start}]`);
          }
      }
    }
  }

  private advance(): string {
    this.current++;
    this.column++;
    return this.source[this.current - 1];
  }

  private addToken(type: TokenType, column?: number, literal?: any): void {
    const text = this.source.substring(this.start, this.current);
    this.tokens.push(new Token(type, text, literal, {
      line: this.line,
      column: column || this.column - text.length,
    }));
  }

  private endReached(): boolean {
    return this.current >= this.source.length;
  }

  private number(): void {
    while (Scanner.isDigit(this.peek())) {
      this.advance();
    }

    if (this.peek() === '.' && Scanner.isDigit(this.peekNext())) {
      this.advance();

      while (Scanner.isDigit(this.peek())) {
        this.advance();
      }
    }

    this.addToken(TokenType.NUMBER, this.column - (this.current - this.start),
      parseFloat(this.source.substring(this.start, this.current)));
  }

  private identifier(): void {
    while (Scanner.isAlphaNumeric(this.peek())) {
      this.advance();
    }

    this.addToken(TokenType.IDENTIFIER, this.column - (this.current - this.start));
  }

  private peek(): string | null {
    if (this.endReached()) {
      return null;
    }
    return this.source[this.current];
  }

  private peekNext(): string {
    if (this.current + 1 >= this.source.length) {
      return '';
    }
    return this.source[this.current + 1];
  }

  private match(c: string): boolean {
    if (this.endReached()) {
      return false;
    }
    if (this.source[this.current] !== c) {
      return false;
    }

    this.current++;
    this.column++;
    return true;
  }

  private string(): void {
    const startColumn = this.column - 1;

    while (this.peek() != '"' && !this.endReached()) {
      if (this.peek() == '\n') {
        throw new Error(`Unterminated string.`);
      }

      this.advance();
    }

    if (this.endReached()) {
      throw new Error(`Unterminated string.`);
    }

    this.advance();

    const value = this.source.substring(this.start + 1, this.current - 1);
    this.addToken(TokenType.STRING, startColumn, value);
  }
}

export function isWhitespace(char: string): boolean {
  const whitespaces = '\r\n \xa0';
  return whitespaces.includes(char);
}
