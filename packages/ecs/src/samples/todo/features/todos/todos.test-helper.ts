// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, System, workers, World } from "../../../../index.js";
import { done, label, order, ordered } from "./data.js";
import { addTodo } from "./model.js";

/** A todo as tests read it. */
export type Listed = { readonly entity: Entity; readonly label: string; readonly done: boolean; readonly order: number };

const listed: Listed[] = [];
const readTodos = System.create({ observer: true, components: { with: [label, done, order] }, order: ordered }, row => {
    listed.push({ entity: row.entity, label: row[label], done: row[done], order: row[order] });
});

/** The todos, in list order. */
export const todosOf = async (world: World): Promise<Listed[]> => {
    listed.length = 0;
    await world.run(readTodos);
    return [...listed];
};

export const labelsOf = async (world: World): Promise<string[]> => (await todosOf(world)).map(item => item.label);

/** A world without a kernel pool, holding todos with these labels, in this order. */
export const withTodos = async (...labels: string[]): Promise<World> => {
    const world = World.create({ [workers]: 0 });
    for (const text of labels) await world.run(addTodo, { label: text });
    return world;
};

/** The entity of the todo with this label. */
export const entityOf = async (world: World, text: string): Promise<Entity> => {
    const found = (await todosOf(world)).find(item => item.label === text);
    if (found === undefined) throw new Error(`No todo "${text}".`);
    return found.entity;
};
