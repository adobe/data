import { on, reported, type Connect } from "../../shared/connect.js";
import { clearCompleted, toggleAll } from "./model.js";

export const connect: Connect = (world, root) => {
    const disconnects = [
        on(root, "todo-toggle-all", event => void reported(world.run(toggleAll, { done: event.detail.done }))),
        on(root, "todo-clear-completed", () => void reported(world.run(clearCompleted))),
    ];
    return () => {
        for (const disconnect of disconnects) disconnect();
    };
};
