import {
  Assign,
  Flag,
  SequenceFlagRef,
  Jump,
  Logical,
  Sequence,
  InnerSequence,
  Variable,
  Binary, Call
} from '../../src/parser/Ast';
import {Parser} from '../../src/parser/Parser';
import {Scanner} from '../../src/scanner/Scanner';
import {AstNodeKind, TernaryCondition, TrackList} from "../../dist/parser/Ast";

test('should parse whitespace', () => {
  const testCodes = [
    ``,
    ` `,
    `   
        `,
    `
        
        
        `
  ];

  testCodes.forEach((code) => {
    const tokens = Scanner.scan(code);
    const exprs = Parser.parse(tokens);
    expect(exprs.length).toBe(0);
  });
});

test('should parse an empty sequence declaration', () => {
  const code = `mySeq = []`;
  const tokens = Scanner.scan(code);
  const exprs = Parser.parse(tokens);

  expect(exprs.length).toEqual(1);
  expect(exprs[0].kind).toEqual(AstNodeKind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.assignee.lexeme).toEqual('mySeq');

  expect(assign.value.kind).toEqual(AstNodeKind.SEQUENCE);
  const sequence = assign.value as Sequence;
  expect(sequence.expressions.length).toBe(0);
});

test('should parse a sequence declaration', () => {
  const testCodes = [
    `
    mySeq = [
        p: 12 | p: 14
        p: 14

        p: 16 | p: 14
    ]
    
    `,
    `mySeq = [ p: 12 | p: 14 ; p: 14 ;
        p: 16 | p: 14;
    ]
    
    `,
  ];

  // Should this be valid ?
  /*
  `mySeq = [ p: 12 | p: 14 ; p: 14 ;
      p: 16 | p: 14
      ;
  ]`
  */

  testCodes.forEach(code => {
    const tokens = Scanner.scan(code);
    const exprs = Parser.parse(tokens);

    expect(exprs.length).toEqual(1);
    expect(exprs[0].kind).toEqual(AstNodeKind.ASSIGN);

    const assign = exprs[0] as Assign;

    expect(assign.value.kind).toEqual(AstNodeKind.SEQUENCE);

    const sequence = assign.value as Sequence;
    expect(sequence.expressions.length).toBe(3);

    sequence.expressions.forEach(expr => expect(expr.kind).toEqual('TRACKS'));
  });

});


test('should parse flags', () => {
  const testCode = `Program = [
        # flagName
        ]`;

  const tokens = Scanner.scan(testCode);
  const exprs = Parser.parse(tokens);

  expect(exprs.length).toEqual(1);
  expect(exprs[0].kind).toEqual(AstNodeKind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.value.kind).toEqual(AstNodeKind.SEQUENCE);

  const sequence = assign.value as Sequence;
  expect(sequence.expressions.length).toBe(1);
  expect(sequence.expressions[0].kind).toEqual('FLAG');

  const flag = sequence.expressions[0] as Flag;
  expect(flag.name.lexeme).toBe('flagName');
});

test('should parse outer jump', () => {
  const testCode = `Program = [
        @ seq #
        @ seq2 # flag
        ]`;

  const tokens = Scanner.scan(testCode);
  const exprs = Parser.parse(tokens);

  expect(exprs.length).toEqual(1);
  expect(exprs[0].kind).toEqual(AstNodeKind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.value.kind).toEqual(AstNodeKind.SEQUENCE);

  const sequence = assign.value as Sequence;
  expect(sequence.expressions.length).toBe(2);

  expect(sequence.expressions[0].kind).toEqual(AstNodeKind.JUMP);
  const jump = sequence.expressions[0] as Jump;
  expect(jump.sequence.lexeme).toBe('seq');

  expect(sequence.expressions[1].kind).toEqual(AstNodeKind.JUMP);
  const secondJump = sequence.expressions[1] as Jump;
  expect(secondJump.sequence.lexeme).toBe('seq2');
  expect(secondJump.flag.lexeme).toBe('flag');
});

test('should parse inner sequences names', () => {
  const testCode = `Program = [
        {inner}
        ]`;

  const tokens = Scanner.scan(testCode);
  const exprs = Parser.parse(tokens);

  expect(exprs.length).toEqual(1);
  expect(exprs[0].kind).toEqual(AstNodeKind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.value.kind).toEqual(AstNodeKind.SEQUENCE);

  const sequence = assign.value as Sequence;
  expect(sequence.expressions.length).toBe(1);
  expect(sequence.expressions[0].kind).toEqual(AstNodeKind.INNER_SEQUENCE);

  const innerSequence = sequence.expressions[0] as InnerSequence;
  expect(innerSequence.maybeSequence.kind).toBe(AstNodeKind.VARIABLE);

  const sequenceName = innerSequence.maybeSequence as Variable;
  expect(sequenceName.name.lexeme).toBe('inner');
});

test('should parse inner sequences names with flag', () => {
  const testCode = `Program = [
        {inner#aze}
        ]`;

  const tokens = Scanner.scan(testCode);
  const exprs = Parser.parse(tokens);

  expect(exprs.length).toEqual(1);
  expect(exprs[0].kind).toEqual(AstNodeKind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.value.kind).toEqual(AstNodeKind.SEQUENCE);

  const sequence = assign.value as Sequence;
  expect(sequence.expressions.length).toBe(1);
  expect(sequence.expressions[0].kind).toEqual(AstNodeKind.INNER_SEQUENCE);

  const innerSequence = sequence.expressions[0] as InnerSequence;
  expect(innerSequence.maybeSequence.kind).toBe(AstNodeKind.SEQUENCE_FLAG_REF);

  const flag = innerSequence.maybeSequence as SequenceFlagRef;
  expect(flag.sequenceName.lexeme).toBe('inner');
});

test('should parse tracks', () => {
  const testCode = `Program = [
        p: 12, v: 12 | p: 15
        p: 16        | ,       | p:13
                     |         |
        -            |         | -
        ,
        ]`;

  const tokens = Scanner.scan(testCode);
  const exprs = Parser.parse(tokens);

  expect(exprs.length).toEqual(1);
  expect(exprs[0].kind).toEqual(AstNodeKind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.value.kind).toEqual(AstNodeKind.SEQUENCE);

  const sequence = assign.value as Sequence;
  expect(sequence.expressions.length).toBe(5);
  expect(sequence.expressions[0].kind).toEqual(AstNodeKind.TRACKS);

  expect((sequence.expressions[0] as TrackList).tracks.length).toBe(2);
  expect((sequence.expressions[1] as TrackList).tracks.length).toBe(3);
  expect((sequence.expressions[4] as TrackList).tracks.length).toBe(1);

});

test('should parse sequence operations', () => {
  const testCode = `Program = [] || [] & []`;

  const tokens = Scanner.scan(testCode);
  const exprs = Parser.parse(tokens);

  expect(exprs.length).toEqual(1);
  expect(exprs[0].kind).toEqual(AstNodeKind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.value.kind).toEqual(AstNodeKind.LOGICAL);

  const first = assign.value as Logical;
  expect(first.left.kind).toBe(AstNodeKind.SEQUENCE);
  expect(first.right.kind).toBe(AstNodeKind.LOGICAL);
  expect(first.operator.lexeme).toEqual('||');

  const second = first.right as Logical;
  expect(second.left.kind).toBe(AstNodeKind.SEQUENCE);
  expect(second.right.kind).toBe(AstNodeKind.SEQUENCE);
  expect(second.operator.lexeme).toEqual('&');
});

test('should parse left/right sequence operations', () => {
  const testCode = `Program = [] >> [] << []`;

  const tokens = Scanner.scan(testCode);
  const exprs = Parser.parse(tokens);

  expect(exprs.length).toEqual(1);
  expect(exprs[0].kind).toEqual(AstNodeKind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.value.kind).toEqual(AstNodeKind.BINARY);

  const first = assign.value as Binary;
  expect(first.left.kind).toBe(AstNodeKind.BINARY);
  expect(first.right.kind).toBe(AstNodeKind.SEQUENCE);
  expect(first.operator.lexeme).toEqual('<<');

  const second = first.left as Binary;
  expect(second.left.kind).toBe(AstNodeKind.SEQUENCE);
  expect(second.right.kind).toBe(AstNodeKind.SEQUENCE);
  expect(second.operator.lexeme).toEqual('>>');
});

test('should parse ternary conditions', () => {
  const testCode = `Program = a == b ? [] : []`;

  const tokens = Scanner.scan(testCode);
  const exprs = Parser.parse(tokens);

  expect(exprs.length).toEqual(1);
  expect(exprs[0].kind).toEqual(AstNodeKind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.value.kind).toEqual(AstNodeKind.TERNARY_COND);

  const first = assign.value as TernaryCondition;
  expect(first.condition.kind).toBe(AstNodeKind.BINARY);
  expect(first.ifBranch.kind).toBe(AstNodeKind.SEQUENCE);
  expect(first.elseBranch.kind).toBe(AstNodeKind.SEQUENCE);
});

test('should parse ternary steps', () => {
  const testCode = `Program = [{a == b ? a : []}]`;

  const tokens = Scanner.scan(testCode);
  const exprs = Parser.parse(tokens);

  expect(exprs.length).toEqual(1);
  expect(exprs[0].kind).toEqual(AstNodeKind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.value.kind).toEqual(AstNodeKind.SEQUENCE);
  const sequence = assign.value as Sequence;

  expect(sequence.expressions[0].kind).toEqual(AstNodeKind.INNER_SEQUENCE);
  const inner = sequence.expressions[0] as InnerSequence;

  expect(inner.maybeSequence.kind).toEqual(AstNodeKind.TERNARY_COND);
  const ternary = inner.maybeSequence as TernaryCondition;

  expect(ternary.condition.kind).toBe(AstNodeKind.BINARY);
  expect(ternary.ifBranch.kind).toBe(AstNodeKind.VARIABLE);
  expect(ternary.elseBranch.kind).toBe(AstNodeKind.SEQUENCE);
});

test('should parse calls', () => {
  const testCode = `Program = [{a(b: 14, c: false)}]`;

  const tokens = Scanner.scan(testCode);
  const exprs = Parser.parse(tokens);

  expect(exprs.length).toEqual(1);
  expect(exprs[0].kind).toEqual(AstNodeKind.ASSIGN);

  const assign = exprs[0] as Assign;
  expect(assign.value.kind).toEqual(AstNodeKind.SEQUENCE);
  const seq = assign.value as Sequence;
  expect(seq.expressions[0].kind).toBe(AstNodeKind.INNER_SEQUENCE);
  const inner = seq.expressions[0] as InnerSequence;
  expect(inner.maybeSequence.kind).toBe(AstNodeKind.CALL);

  const call = inner.maybeSequence as Call;
  expect(call.callee.kind).toBe(AstNodeKind.VARIABLE);
  expect(call.args.length).toBe(2);
  expect(call.args[0].kind).toBe(AstNodeKind.PARAM);
});

