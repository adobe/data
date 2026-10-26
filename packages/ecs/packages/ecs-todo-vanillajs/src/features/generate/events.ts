// © 2026 Adobe. MIT License. See /LICENSE for details.
import { on, type Connect } from "../../shared/connect.js";
import { addGenerated } from "./model.js";

export const connect: Connect = (world, root) => on(root, "todo-generate", event => void world.run(addGenerated, { count: event.detail.count }));
