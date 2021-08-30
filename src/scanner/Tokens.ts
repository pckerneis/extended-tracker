export enum TokenType {
  EOF             = 'EOF',
  LEFT_PAREN      = '(',
  RIGHT_PAREN     = ')',
  LEFT_BRACE      = '{',
  RIGHT_BRACE     = '}',
  COMMA           = ',',
  DOT             = '.',
  PLUS            = '+',
  MINUS           = '-',
  SEMICOLON       = ';',
  SLASH           = '/',
  STAR            = '*',
  MODULO          = '%',
  BANG            = '!',
  EQUAL           = '=',
  CONDITIONAL     = '?',
  NUMBER          = 'number',
  STRING          = 'string',
  IDENTIFIER      = 'identifier',
  BANG_EQUAL      = '!=',
  EQUAL_EQUAL     = '==',
  LESS            = '<',
  GREATER         = '>',
  LESS_EQUAL      = '<=',
  GREATER_EQUAL   = '>=',
  PIPE            = '|',
  DOUBLE_PIPE     = '||',
  LEFT_BRACKET    = '[',
  RIGHT_BRACKET   = ']',
  COLON           = ':',
  AMPERSAND       = '&',
  DOLLAR          = '$',
  NEW_LINE        = 'NL',
  DASH            = '#',
  AT              = '@',
}

export const operators = '(){}[],.+-;/*%!=?<>|&$:"';

export interface CodePosition {
  readonly line: number;
  readonly column: number,
}

export function asCodePosition(x: number, y: number): CodePosition {
  return {
    line: y,
    column: x,
  }
}

export class Token {
  constructor(public readonly type: TokenType,
              public lexeme: string,
              public literal: any,
              public readonly position: CodePosition) {
  }

  public static EOF(line: number): Token {
    return new Token(TokenType.EOF, '', null, { line, column: 0 });
  }
}
