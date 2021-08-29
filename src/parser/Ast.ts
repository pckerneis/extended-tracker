import {Token} from '../scanner/tokens';

export enum Kind {
  SEQUENCE = 'SEQUENCE',
  TRACKS = 'TRACKS',
  VARIABLE = 'VARIABLE',
  ASSIGN = 'ASSIGN',
  PARAM = 'PARAM',
  PARAMS = 'PARAMS',
  LOGICAL = 'LOGICAL',
  RL_UNARY = 'RL_UNARY',
  BINARY = 'BINARY',
  LITERAL = 'LITERAL',
  GROUPING = 'GROUPING',
  TERNARY_COND = 'TERNARY_COND',
  CALL = 'CALL',
  FLAG = 'FLAG',
  JUMP = 'JUMP',
}

export interface Sequence {
  readonly kind: Kind.SEQUENCE;
  readonly expressions: (Expr | null)[];
  readonly startToken: Token;
  readonly endToken: Token;
}

export interface TrackList {
  readonly kind: Kind.TRACKS;
  readonly tracks: Expr[];
}

export interface Variable {
  readonly kind: Kind.VARIABLE;
  readonly name: Token;
}

export interface Assign {
  readonly kind: Kind.ASSIGN;
  readonly value: Expr;
  readonly assignee: Token;
  readonly equals: Token;
}

export interface Param {
  readonly kind: Kind.PARAM;
  readonly value: Expr;
  readonly assignee: Token;
  readonly colon: Token;
}

export interface ParamList {
  readonly kind: Kind.PARAMS;
  readonly params: Expr[];
}

export interface Logical {
  readonly kind: Kind.LOGICAL;
  readonly left: Expr;
  readonly right: Expr;
  readonly operator: Token;
}

export interface RLUnary {
  readonly kind: Kind.RL_UNARY;
  readonly right: Expr;
  readonly operator: Token;
}

export interface Binary {
  readonly kind: Kind.BINARY;
  readonly left: Expr;
  readonly operator: Token;
  readonly right: Expr;
}

export interface Literal {
  readonly kind: Kind.LITERAL;
  readonly value: any;
  readonly token: Token;
}

export interface Grouping {
  readonly kind: Kind.GROUPING;
  readonly expr: Expr;
}

export interface TernaryCondition {
  readonly kind: Kind.TERNARY_COND;
  readonly condition: Expr;
  readonly ifBranch: Expr;
  readonly elseBranch: Expr;
  readonly operators: Token[];
}

export interface Call {
  readonly kind: Kind.CALL;
  readonly callee: Expr;
  readonly parenTokens: Token[];
  readonly args: Expr[];
}

export interface Flag {
  readonly kind: Kind.FLAG;
  readonly flagToken: Token;
  readonly name: Token;
}

export interface Jump {
  readonly kind: Kind.JUMP;
  readonly jumpToken: Token;
  readonly name: Token;
}

export type Expr =
  Sequence
  | Binary
  | Call
  | RLUnary
  | Literal
  | Grouping
  | Assign
  | Variable
  | TernaryCondition
  | Logical
  | Param
  | ParamList
  | TrackList
  | Flag
  | Jump;
