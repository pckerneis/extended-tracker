import {Assign, Flag, SequenceFlagRef, Jump, Logical, Sequence, InnerSequence, Variable} from '../../src/parser/Ast';
import {Parser} from '../../src/parser/Parser';
import {Scanner} from '../../src/scanner/Scanner';
import {Kind, TernaryCondition, TrackList} from "../../dist/parser/Ast";

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
  expect(exprs[0].kind).toEqual(Kind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.assignee.lexeme).toEqual('mySeq');

  expect(assign.value.kind).toEqual(Kind.SEQUENCE);
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
    expect(exprs[0].kind).toEqual(Kind.ASSIGN);

    const assign = exprs[0] as Assign;

    expect(assign.value.kind).toEqual(Kind.SEQUENCE);

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
  expect(exprs[0].kind).toEqual(Kind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.value.kind).toEqual(Kind.SEQUENCE);

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
  expect(exprs[0].kind).toEqual(Kind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.value.kind).toEqual(Kind.SEQUENCE);

  const sequence = assign.value as Sequence;
  expect(sequence.expressions.length).toBe(2);

  expect(sequence.expressions[0].kind).toEqual(Kind.JUMP);
  const jump = sequence.expressions[0] as Jump;
  expect(jump.sequence.lexeme).toBe('seq');

  expect(sequence.expressions[1].kind).toEqual(Kind.JUMP);
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
  expect(exprs[0].kind).toEqual(Kind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.value.kind).toEqual(Kind.SEQUENCE);

  const sequence = assign.value as Sequence;
  expect(sequence.expressions.length).toBe(1);
  expect(sequence.expressions[0].kind).toEqual(Kind.INNER_SEQUENCE);

  const innerSequence = sequence.expressions[0] as InnerSequence;
  expect(innerSequence.maybeSequence.kind).toBe(Kind.VARIABLE);

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
  expect(exprs[0].kind).toEqual(Kind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.value.kind).toEqual(Kind.SEQUENCE);

  const sequence = assign.value as Sequence;
  expect(sequence.expressions.length).toBe(1);
  expect(sequence.expressions[0].kind).toEqual(Kind.INNER_SEQUENCE);

  const innerSequence = sequence.expressions[0] as InnerSequence;
  expect(innerSequence.maybeSequence.kind).toBe(Kind.SEQUENCE_FLAG_REF);

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
  expect(exprs[0].kind).toEqual(Kind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.value.kind).toEqual(Kind.SEQUENCE);

  const sequence = assign.value as Sequence;
  expect(sequence.expressions.length).toBe(5);
  expect(sequence.expressions[0].kind).toEqual(Kind.TRACKS);

  expect((sequence.expressions[0] as TrackList).tracks.length).toBe(2);
  expect((sequence.expressions[1] as TrackList).tracks.length).toBe(3);
  expect((sequence.expressions[4] as TrackList).tracks.length).toBe(1);

});

test('should parse sequence operations', () => {
  const testCode = `Program = [] || [] & []`;

  const tokens = Scanner.scan(testCode);
  const exprs = Parser.parse(tokens);

  expect(exprs.length).toEqual(1);
  expect(exprs[0].kind).toEqual(Kind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.value.kind).toEqual(Kind.LOGICAL);

  const first = assign.value as Logical;
  expect(first.left.kind).toBe(Kind.SEQUENCE);
  expect(first.right.kind).toBe(Kind.LOGICAL);
  expect(first.operator.lexeme).toEqual('||');

  const second = first.right as Logical;
  expect(second.left.kind).toBe(Kind.SEQUENCE);
  expect(second.right.kind).toBe(Kind.SEQUENCE);
  expect(second.operator.lexeme).toEqual('&');
});


test('should parse ternary conditions', () => {
  const testCode = `Program = a == b ? [] : []`;

  const tokens = Scanner.scan(testCode);
  const exprs = Parser.parse(tokens);

  expect(exprs.length).toEqual(1);
  expect(exprs[0].kind).toEqual(Kind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.value.kind).toEqual(Kind.TERNARY_COND);

  const first = assign.value as TernaryCondition;
  expect(first.condition.kind).toBe(Kind.BINARY);
  expect(first.ifBranch.kind).toBe(Kind.SEQUENCE);
  expect(first.elseBranch.kind).toBe(Kind.SEQUENCE);
});

test.skip('should parse ternary steps', () => {
  const testCode = `Program = [a == b ? {a} : {b}]`;

  const tokens = Scanner.scan(testCode);
  const exprs = Parser.parse(tokens);

  expect(exprs.length).toEqual(1);
  expect(exprs[0].kind).toEqual(Kind.ASSIGN);

  const assign = exprs[0] as Assign;

  expect(assign.value.kind).toEqual(Kind.TERNARY_COND);

  const first = assign.value as TernaryCondition;
  expect(first.condition.kind).toBe(Kind.BINARY);
  expect(first.ifBranch.kind).toBe(Kind.SEQUENCE);
  expect(first.elseBranch.kind).toBe(Kind.SEQUENCE);
});

