import {AstNodeKind, Binary, Call, Expr, Logical, RLUnary, TernaryCondition} from '../parser/Ast';
import {TokenType} from '../scanner/Tokens';

export class Interpreter {
  static evaluateAsPrimitive(expr: Expr, env: any): any {
    if (expr == null) {
      return null;
    }

    switch (expr.kind) {
      case AstNodeKind.VARIABLE:
        return env[expr.name.lexeme];
      case AstNodeKind.LITERAL:
        return expr.value;
      case AstNodeKind.RL_UNARY:
        return this.evaluateUnary(expr, env);
      case AstNodeKind.BINARY:
        return this.evaluateBinary(expr, env);
      case AstNodeKind.GROUPING:
        return this.evaluateAsPrimitive(expr.expr, env);
      case AstNodeKind.TERNARY_COND:
        return this.evaluateTernaryCondition(expr, env);
      case AstNodeKind.LOGICAL:
        return this.evaluateLogical(expr, env);
      case AstNodeKind.CALL:
        return this.evaluateCall(expr, env);
    }
  }

  static evaluateUnary(expr: RLUnary, env: any): null | any {
    switch (expr.operator.type) {
      case TokenType.BANG:
        return !this.evaluateAsPrimitive(expr.right, env);
      case TokenType.MINUS:
        return -this.evaluateAsPrimitive(expr.right, env);
    }
  }

  static evaluateBinary(expr: Binary, env: any) {
    const left = this.evaluateAsPrimitive(expr.left, env);
    const right = this.evaluateAsPrimitive(expr.right, env);

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

  static evaluateTernaryCondition(expr: TernaryCondition, env: any): null | any {
    const predicate = this.evaluateAsPrimitive(expr.condition, env);

    if (predicate) {
      return this.evaluateAsPrimitive(expr.ifBranch, env);
    } else {
      return this.evaluateAsPrimitive(expr.elseBranch, env)
    }
  }

  static evaluateLogical(expr: Logical, env: any): null | any {
    const left = this.evaluateAsPrimitive(expr.left, env);
    const right = this.evaluateAsPrimitive(expr.right, env);

    if (expr.operator.type === TokenType.DOUBLE_AMPERSAND) {
      return left && right;
    } else {
      return left || right;
    }
  }

  static evaluateCall(expr: Call, env: any): any {
    const callee = this.evaluateAsPrimitive(expr.callee, env);
    const args = this.paramsToMessage(expr.args, env);

    if (typeof callee === 'function') {
      return callee({...env, ...args});
    }
  }

  static paramsToMessage(params: Expr[], env: any): {} {
    const msg = {};

    params.forEach(param => {
      if (param.kind === AstNodeKind.PARAM) {
        if (param.value) {
          msg[param.assignee.lexeme] = this.evaluateAsPrimitive(param.value, env);
        } else {
          msg[param.assignee.lexeme] = env[param.assignee.lexeme];
        }
      }
    });

    return msg;
  }
}
