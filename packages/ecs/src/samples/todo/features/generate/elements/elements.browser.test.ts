import { describe, expect, it } from "vitest";
import { part, record } from "../../../shared/elements/elements.test-helper.js";
import { TodoGenerate } from "./todo-generate.js";
import { define } from "../../../shared/elements/define.js";

define({ "todo-generate": TodoGenerate });

describe("todo-generate", () => {
    it("dispatches todo-generate with each button's count", () => {
        const generate = document.createElement("todo-generate");
        document.body.append(generate);
        const seen = record(document.body, "todo-generate");
        part(generate, "[data-count='10']", HTMLButtonElement).click();
        part(generate, "[data-count='1000']", HTMLButtonElement).click();
        expect(seen.map(event => event.detail)).toEqual([{ count: 10 }, { count: 1000 }]);
        generate.remove();
    });
});
