import type { Program } from './kernel.js';

type Expression = Program.Expression;
type Statement = Program.Statement;

const expression = (node: Expression): Expression => {
    switch (node.kind) {
        case "lane": return expression(node.value);
        case "unary": return { ...node, operand: expression(node.operand) };
        case "binary": case "logical": return { ...node, left: expression(node.left), right: expression(node.right) };
        case "conditional": return { ...node, test: expression(node.test), consequent: expression(node.consequent), alternate: expression(node.alternate) };
        case "math": return { ...node, arguments: node.arguments.map(expression) };
        default: return node;
    }
};

const statements = (body: readonly Statement[]): Statement[] => body.flatMap((node): Statement[] => {
    switch (node.kind) {
        case "intrinsic": return statements(node.body);
        case "set": case "store": return [{ ...node, value: expression(node.value) }];
        case "if": return [{ ...node, test: expression(node.test), consequent: statements(node.consequent), alternate: statements(node.alternate) }];
        case "block": case "loop": return [{ ...node, body: statements(node.body) }];
        case "branchIf": return [{ ...node, test: expression(node.test) }];
        case "find": return [{ ...node, entity: expression(node.entity) }];
        default: return [node];
    }
});

/** The program with each intrinsic region replaced by its body, for backends that don't emit intrinsics. */
export const withoutIntrinsics = (program: Program): Program =>
    (program.intrinsics ?? 0) === 0 ? program : { ...program, intrinsics: 0, body: statements(program.body) };
