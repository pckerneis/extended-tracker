import { Token } from "../scanner/tokens";

export interface Sequence {
  readonly kind: 'SEQUENCE';
  readonly expressions: (Expr | null)[];
  readonly startToken: Token;
  readonly endToken: Token;
}

export interface ChannelList {
  readonly kind: 'CHANNELS';
  readonly channels: Expr[];
}

export interface Variable {
  readonly kind: 'VARIABLE';
  readonly name: Token;
}

export interface Assign {
  readonly kind: 'ASSIGN';
  readonly value: Expr;
  readonly assignee: Token;
  readonly equals: Token;
}

export interface Param {
  readonly kind: 'PARAM';
  readonly value: Expr;
  readonly assignee: Token;
  readonly colon: Token;
}

export interface ParamList {
  readonly kind: 'PARAMS';
  readonly params: Expr[];
}

export interface Logical {
  readonly kind: 'LOGICAL';
  readonly left: Expr;
  readonly right: Expr;
  readonly operator: Token;
}

export interface RLUnary {
  readonly kind: 'RL_UNARY';
  readonly right: Expr;
  readonly operator: Token;
}

export interface Binary {
  readonly kind: 'BINARY';
  readonly left: Expr;
  readonly operator: Token;
  readonly right: Expr;
}

export interface Literal {
  readonly kind: 'LITERAL';
  readonly value: any;
  readonly token: Token;
}

export interface Grouping {
  readonly kind: 'GROUPING';
  readonly expr: Expr;
}

export interface TernaryCondition {
  readonly kind: 'TERNARY_COND';
  readonly condition: Expr;
  readonly ifBranch: Expr;
  readonly elseBranch: Expr;
  readonly operators: Token[];
}

export interface Call {
  readonly kind: 'CALL';
  readonly callee: Expr;
  readonly parenTokens: Token[];
  readonly args: Expr[];
}

export interface Flag {
  readonly kind: 'FLAG';
  readonly flagToken: Token;
  readonly name: Token;
}

export interface Jump {
  readonly kind: 'JUMP';
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
  | ChannelList
  | Flag
  | Jump;
