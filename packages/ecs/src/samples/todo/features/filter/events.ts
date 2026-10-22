import { on, type Connect } from "../../shared/connect.js";
import { setFilter } from "./model.js";

export const connect: Connect = (world, root) => on(root, "todo-filter", event => void world.run(setFilter, { filter: event.detail.filter }));
