// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity, World } from "@adobe/ecs";
import { todosOf } from "./function.todos-of.js";

/** The entity of the todo with this label. */
export const todoLabelled = async (world: World, text: string): Promise<Entity> => {
    const found = (await todosOf(world)).find(item => item.label === text);
    if (found === undefined) throw new Error(`No todo "${text}".`);
    return found.entity;
};
