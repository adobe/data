import type { Program } from './kernel.js';

type Expression = Program.Expression;
type Statement = Program.Statement;

/** Each WGSL value type's scalar lanes: one per element of a vector, sixteen for a matrix. */
const lanes: { readonly [T in Program.ValueType]: number } = {
    f32: 1, i32: 1, u32: 1, vec2f: 2, vec3f: 3, vec4f: 4, vec2i: 2, vec3i: 3, vec4i: 4, vec2u: 2, vec3u: 3, vec4u: 4, mat4x4f: 16,
};

export const laneCount = (type: Program.ValueType): number => lanes[type];

export const isValueType = (text: string): text is Program.ValueType => Object.hasOwn(lanes, text);

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
