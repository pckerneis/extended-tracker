import {Assign, Expr, Sequence} from '../parser/Ast';
import {Parser} from '../parser/Parser';
import {Scanner} from '../scanner/Scanner';

export interface CodeProvider {
    code: string;
}

export interface Message {
    [paramName: string]: any;
}

export interface FlagMessage {
    name: string;
}

export interface JumpMessage {
    name: string;
}

export interface Step {
    messages?: Message[];
    flag?: FlagMessage;
    jump?: JumpMessage;
}

export interface MessageSequence {
    steps: Step[];
}

export class Interpreter {
    public static interpret(code: string): MessageSequence {
        try {
            const tokens = Scanner.scan(code);
            const expressions = Parser.parse(tokens);
            return this.readProgram(expressions);
        } catch (e) {
            console.log('Parsing error ' + e);
        }
    }

    private static readProgram(expressions: Expr[]): MessageSequence {
        const programDeclaration = this.findDeclaration('Program', expressions);
        const steps: Step[] = [];

        if (programDeclaration && programDeclaration.value.kind === 'SEQUENCE') {
            const programSequence = programDeclaration.value as Sequence;

            programSequence.expressions.forEach(channelsOrFlagOrJump => {

                if (channelsOrFlagOrJump.kind === 'FLAG') {
                    const flag = ({name: channelsOrFlagOrJump.name.lexeme});
                    steps.push({flag});
                } else if (channelsOrFlagOrJump.kind === 'JUMP') {
                    const jump = {name: channelsOrFlagOrJump.name.lexeme};
                    steps.push({jump});
                } else if (channelsOrFlagOrJump.kind === 'CHANNELS') {
                    const messages: Message[] = [];

                    channelsOrFlagOrJump.channels.forEach((params, channelIndex) => {
                        const paramMap = {
                            i: channelIndex,
                        };

                        if (params.kind === 'PARAMS') {
                            params.params.forEach(param => {
                                if (param.kind === 'PARAM') {
                                    paramMap[param.assignee.lexeme] = param.value.kind === 'LITERAL' ? param.value.value : null;
                                }
                            });
                        }

                        messages.push(paramMap);
                    });

                    steps.push({messages});
                }
            });
        }

        return { steps };
    }

    private static findDeclaration(variableName: string, expressions: Expr[]): Assign {
        return expressions.find(expr => expr.kind === 'ASSIGN'
          && expr.assignee.lexeme === variableName) as Assign;
    }
}
