// © 2026 Adobe. MIT License. See /LICENSE for details.
import { workers, World } from "@adobe/ecs";
import { addTodo } from "../../../features/todos/model/index.js";

/** A world without a kernel pool, holding todos with these labels, in this order. */
export const withTodos = async (...labels: string[]): Promise<World> => {
    const world = World.create({ [workers]: 0 });
    for (const text of labels) await world.run(addTodo, { label: text });
    return world;
};
