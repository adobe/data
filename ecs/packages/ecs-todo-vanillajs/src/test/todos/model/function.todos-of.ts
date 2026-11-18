// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System, type World } from "@adobe/ecs";
import { done, label, order, ordered } from "../../../features/todos/model/index.js";

/** The todos, in list order. */
export const todosOf = async (world: World): Promise<Listed[]> => {
    listed.length = 0;
    await world.run(readTodos);
    return [...listed];
};

const listed: Listed[] = [];
const readTodos = System.create({ readonly: true, components: { with: [label, done, order] }, order: ordered }, row => {
    listed.push({ entity: row.entity, label: row[label], done: row[done], order: row[order] });
});

/** A todo as tests read it. */
type Listed = { readonly entity: Entity; readonly label: string; readonly done: boolean; readonly order: number };
