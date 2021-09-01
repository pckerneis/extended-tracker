import {Assign, Flag, InnerSequence, Jump, Sequence} from '../../src/parser/Ast';
import {Parser} from '../../src/parser/Parser';
import {Scanner} from '../../src/scanner/Scanner';

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
  expect(exprs[0].kind).toEqual('ASSIGN');

  const assign = exprs[0] as Assign;

  expect(assign.assignee.lexeme).toEqual('mySeq');

  expect(assign.value.kind).toEqual('SEQUENCE');
  const sequence = assign.value as Sequence;
  expect(sequence.expressions.length).toBe(0);
});

test('should parse a sequence declaration', () => {
  const testCodes = [`
    
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
    expect(exprs[0].kind).toEqual('ASSIGN');

    const assign = exprs[0] as Assign;

    expect(assign.value.kind).toEqual('SEQUENCE');

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
    expect(exprs[0].kind).toEqual('ASSIGN');

    const assign = exprs[0] as Assign;

    expect(assign.value.kind).toEqual('SEQUENCE');

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
    expect(exprs[0].kind).toEqual('ASSIGN');

    const assign = exprs[0] as Assign;

    expect(assign.value.kind).toEqual('SEQUENCE');

    const sequence = assign.value as Sequence;
    expect(sequence.expressions.length).toBe(2);

    expect(sequence.expressions[0].kind).toEqual('JUMP');
    const jump = sequence.expressions[0] as Jump;
    expect(jump.sequence.lexeme).toBe('seq');

    expect(sequence.expressions[1].kind).toEqual('JUMP');
    const secondJump = sequence.expressions[1] as Jump;
    expect(secondJump.sequence.lexeme).toBe('seq2');
    expect(secondJump.flag.lexeme).toBe('flag');
});


test('should parse inner sequences', () => {
  const testCode = `Program = [
        {inner}
        ]`;

  const tokens = Scanner.scan(testCode);
  const exprs = Parser.parse(tokens);

  expect(exprs.length).toEqual(1);
  expect(exprs[0].kind).toEqual('ASSIGN');

  const assign = exprs[0] as Assign;

  expect(assign.value.kind).toEqual('SEQUENCE');

  const sequence = assign.value as Sequence;
  expect(sequence.expressions.length).toBe(1);
  expect(sequence.expressions[0].kind).toEqual('INNER_SEQUENCE');

  const flag = sequence.expressions[0] as InnerSequence;
  expect(flag.sequenceName.lexeme).toBe('inner');

});
