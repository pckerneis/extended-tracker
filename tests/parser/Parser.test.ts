import { Assign, Sequence } from '../../src/parser/Ast';
import { Parser } from '../../src/parser/Parser';
import { Scanner } from '../../src/scanner/Scanner';

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
    
        sequence.expressions.forEach(expr => expect(expr.kind).toEqual('CHANNELS'));
    });

});
