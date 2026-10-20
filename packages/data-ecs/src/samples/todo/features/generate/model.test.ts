import { expect, it } from "vitest";
import { labelsOf, todosOf, withTodos } from "../todos/todos.test-helper.js";
import { addGenerated, generatedLabel } from "./model.js";

it("adds generated todos after the ones there, each label numbered", async () => {
    await using world = await withTodos("first");
    await world.run(addGenerated, { count: 3 });
    expect(await labelsOf(world)).toEqual(["first", generatedLabel(1), generatedLabel(2), generatedLabel(3)]);
    expect(new Set(await labelsOf(world)).size).toBe(4);
    const orders = (await todosOf(world)).map(item => item.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    expect(generatedLabel(0)).toBe("Buy milk #1");
});
