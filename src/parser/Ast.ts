import {Token} from '../scanner/tokens';

export enum AstNodeKind {
  SEQUENCE = 'SEQUENCE',
  INNER_SEQUENCE = 'INNER_SEQUENCE',
  SEQUENCE_FLAG_REF = 'SEQUENCE_FLAG_REF',
  TRACKS = 'TRACKS',
  VARIABLE = 'VARIABLE',
  ASSIGN = 'ASSIGN',
  PARAM = 'PARAM',
  EMPTY_PARAM = 'EMPTY_PARAM',
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
  SILENCE = 'SILENCE',
}

export interface Sequence {
  readonly kind: AstNodeKind.SEQUENCE;
  readonly expressions: (Expr | null)[];
  readonly startToken: Token;
  readonly endToken: Token;
}

export interface InnerSequence {
  readonly kind: AstNodeKind.INNER_SEQUENCE;
  readonly startToken: Token;
  readonly endToken: Token;
  readonly maybeSequence?: Expr;
}

export interface SequenceFlagRef {
  readonly kind: AstNodeKind.SEQUENCE_FLAG_REF;
  readonly sequenceName?: Token;
  readonly flagToken?: Token;
  readonly flagName?: Token;
}

export interface TrackList {
  readonly kind: AstNodeKind.TRACKS;
  readonly tracks: Expr[];
}

export interface Variable {
  readonly kind: AstNodeKind.VARIABLE;
  readonly name: Token;
}

export interface Assign {
  readonly kind: AstNodeKind.ASSIGN;
  readonly value: Expr;
  readonly assignee: Token;
  readonly equals: Token;
}

export interface Silence {
  readonly kind: AstNodeKind.SILENCE;
  readonly token: Token;
}

export interface Param {
  readonly kind: AstNodeKind.PARAM;
  readonly value: Expr;
  readonly assignee: Token;
  readonly colon: Token;
}

export interface EmptyParam {
  readonly kind: AstNodeKind.EMPTY_PARAM;
}

export interface ParamList {
  readonly kind: AstNodeKind.PARAMS;
  readonly params: Expr[];
}

export interface Logical {
  readonly kind: AstNodeKind.LOGICAL;
  readonly left: Expr;
  readonly right: Expr;
  readonly operator: Token;
}

export interface RLUnary {
  readonly kind: AstNodeKind.RL_UNARY;
  readonly right: Expr;
  readonly operator: Token;
}

export interface Binary {
  readonly kind: AstNodeKind.BINARY;
  readonly left: Expr;
  readonly operator: Token;
  readonly right: Expr;
}

export interface Literal {
  readonly kind: AstNodeKind.LITERAL;
  readonly value: any;
  readonly token: Token;
}

export interface Grouping {
  readonly kind: AstNodeKind.GROUPING;
  readonly expr: Expr;
}

export interface TernaryCondition {
  readonly kind: AstNodeKind.TERNARY_COND;
  readonly condition: Expr;
  readonly ifBranch: Expr;
  readonly elseBranch: Expr;
  readonly operators: Token[];
}

export interface Call {
  readonly kind: AstNodeKind.CALL;
  readonly callee: Expr;
  readonly parenTokens: Token[];
  readonly args: Expr[];
}

export interface Flag {
  readonly kind: AstNodeKind.FLAG;
  readonly flagToken: Token;
  readonly name: Token;
}

export interface Jump {
  readonly kind: AstNodeKind.JUMP;
  readonly jumpToken: Token;
  readonly flag: Token;
  readonly sequence: Token;
  readonly flagToken: Token;
}

export type Expr =
  | Assign
  | Binary
  | Call
  | EmptyParam
  | Flag
  | Grouping
  | InnerSequence
  | SequenceFlagRef
  | Jump
  | Literal
  | Logical
  | Param
  | ParamList
  | RLUnary
  | Sequence
  | Silence
  | TernaryCondition
  | TrackList
  | Variable
;