// © 2026 Adobe. MIT License. See /LICENSE for details.
import { checkChapters } from "ecs-guide-checks";

/** What each chapter teaches, which its prose names as code and its program does; 0 is the unnumbered keys chapter's. */
const teaches: { readonly [chapter: number]: readonly string[] } = {
    0: ["Symbol()", "declare module \"@adobe/ecs\"", "Components", "Resources", "row[score]", "resources[bonus]", "default"],
    1: ["Resources", "default", "World.create", "readonly: true", "run", "ReadonlyMap", "Entity"],
    2: ["Components", "type: true", "as const", "commands.spawn", "commands.remove", "with: [...Particle]"],
    3: ["System.create", "with", "not", "readonly: true", "optional: [velocity]"],
    4: ["clock", "delta", "cadence", "always", "resources: { changed: [elapsed] }", "wake", "reduce[wake]", "world.add", "world.remove"],
    5: ["after", "during", "System.create([heal, hit])", "during: [update]"],
    6: ["commands.spawn", "commands.add", "commands.despawn", "after: [spawn]", "readonly: true"],
    7: ["resources: { changed: [level] }", "changed: [score]", "resources: { is: [map], not: [paused] }", "resources[map]"],
    8: ["world.run(hit, { amount: 3 })", "target: \"entity\""],
    9: ["Rule.create", "derived: true"],
    10: ["world.dispose()", "Finalizer.changes", "changes.previous", "changes.next"],
    11: ["reference: \"owner\"", "reference: \"weak\"", "within: typeof selected", "interface Traits<N>", "Component.With<typeof instanced>"],
    12: ["lookup: { enemy: { with", "lookup.enemy(", "changed: [health]", "changed"],
    13: ["Index.create", "key", "lookup: { at: { index: grid } }", "sorted: true", "{ \">=\": 90 }", "order: byScore", "unique: true", "key: []", "length", "at(i)", "changed: true"],
    14: ["kernel: true", "kernel: false", "F32"],
    15: ["reduce: \"+\"", "\"max\"", "reduce[total]("],
    16: ["kernel: \"gpu\"", "System.render", "accessors", "tables", "table.bind(pass)", "table.count", "Gpu.wgsl(draw)"],
    17: ["reference: \"owner\"", "up: { through: parent }", "up", "null"],
    18: ["explode"],
    19: ["interface Threads", "thread: \"audio\"", "world.share(", "World.join(", "{ threads: [\"audio\"] }", "audio.run"],
    20: ["shared: true", "commands.spawn(Unit, {", "row[cell]", "commands.add", "where: { [cell]: [4, 0] }", "where", "changed: [position]"],
    21: ["thread: \"main\"", "cadence", "always", "commands.add", "is: [stage]", "style.translate", "changed: [position]"],
    22: ["changed: [clock]", "is: [pen]", "key: []", "clearRect(", "arc(", "fill()", "getImageData("],
};

/**
 * Changes to each chapter's program, each taking away a point it teaches, which its output catches: each its code as
 * written, once in the program, what takes its place, and the failure it then prints, where it's one.
 */
const mutations: { readonly [chapter: number]: readonly (readonly [string, string, string?])[] } = {
    0: [
        ["default: 5 ", ""],
        ["export const score = Symbol();", "export const score = Symbol.for(\"score\");", "a component's key score is a top-level `Symbol()` constant of this module"],
        ["export const score = Symbol();", "export const score = [Symbol()][0];", "a component's key score is a top-level `Symbol()` constant of this module"],
        ["        [score]: { type: number };\n", "", "System \"award\" uses component \"score\", which isn't a registered component: declare it beside its key, in interface Components or Resources."],
    ],
    1: [["World.create({ [gravity]: -1.6 })", "World.create()"], ["default: -9.8 ", ""], ["{ default: -Infinity }", "{}"]],
    2: [["commands.remove(row.entity, enemy);", ""], ["{ [position]: [0, 10, 0] }", "{}"]],
    3: [
        ["not: [frozen]", "not: []"], ["System.create([count, fail])", "System.create([fail])"],
    ],
    4: [["world.remove(advance);", ""]],
    5: [["after: [hit] ", ""], ["during: [update] ", ""]],
    6: [["commands.add(hero, health, 5);", ""], ["commands.despawn(commands.spawn([health])({ [health]: 1 }));", "commands.spawn([health])({ [health]: 1 });"], ["watched.add(watch);", ""], ["const watch = System.create({ readonly: true, ", "const watch = System.create({ "]],
    7: [["resources: { changed: [level] } ", ""], [", changed: [score]", ""], [", not: [paused]", ""], ["is: [map], ", ""]],
    8: [["target: \"entity\",", ""]],
    9: [["with: [mesh], not: [hidden]", "with: [mesh]"], ["Rule.create({ components: { with: [sprite], not: [hidden] }, derive: [drawn] });", ""], ["Rule.create({ components: { with: [drawn] }, derive: [layer] });", ""]],
    10: [["open.delete(row[handle]);", ""], ["await world.dispose();", ""], ["changes.previous(entity, handle)", "null"]],
    11: [["; reference: \"owner\"", ""], ["; reference: \"weak\"", ""], ["; within: typeof selected", ""]],
    12: [["with: [health], not: [frozen]", "with: [health]"], ["with: [health], changed: [health]", "with: [health]"]],
    13: [["sorted: true, ", ""], ["unique: true, ", ""], [", changed: true", ""], ["key: [cell]", "key: [crowded]"]],
    15: [["reduce[count](1);", ""], ["reduce: \"max\"", "reduce: \"+\""]],
    16: [[", dotSize: size", ""]],
    17: [[", up: { through: parent }", ""]],
    19: [["audio.add(listen);", ""], ["await audio.run(mix);", ""]],
    20: [
        [", [velocity]: [4, 0]", ""], ["with: [position], where: { [cell]: [4, 0] }", "with: [position]"],
        ["with: [position], where: { [cell]: (at, { resources }) => resources[camera]?.sees(at) === true } }", "with: [position] }"],
        ["changed: [position], ", ""], ["await world.run(cross);", ""], ["await world.run(look, { x: 2, y: 2 });", ""],
    ],
    21: [["row[dot].remove();", ""], ["commands.add(row.entity, dot, element);", ""]],
    22: [["context.fill();", ""]],
};

checkChapters({ folder: new URL(".", import.meta.url), teaches, mutations });
