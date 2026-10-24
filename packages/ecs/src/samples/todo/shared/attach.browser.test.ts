// © 2026 Adobe. MIT License. See /LICENSE for details.
import { afterEach, describe, expect, it } from "vitest";
import { Entity, System, workers, World } from "../../../index.js";
import { attach, entityOf, entityOfElement } from "./attach.js";

afterEach(() => {
    document.body.replaceChildren();
});

/** Two live entities of a world, for elements to show. */
const twoEntities = async (): Promise<readonly [Entity, Entity]> => {
    const spawned: Entity[] = [];
    await using world = World.create({ [workers]: 0 });
    await world.run(System.create({}, ({ commands }) => {
        spawned.push(commands.spawn([])({}), commands.spawn([])({}));
    }));
    const [first, second] = spawned;
    if (first === undefined || second === undefined) throw new Error("Nothing spawned.");
    return [first, second];
};

/** The entity `entityOf` finds for an event of `type` dispatched at `target`, as a listener on the body reads it. */
const foundFor = (target: EventTarget, type = "attach-test"): Entity => {
    let found: Entity | null = null;
    const listener = (event: Event): void => { found = entityOf(event); };
    document.body.addEventListener(type, listener);
    target.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true }));
    document.body.removeEventListener(type, listener);
    if (found === null) throw new Error("The event didn't reach the body.");
    return found;
};

describe("attach and entityOf", () => {
    it("give the entity an element was attached to, returning the element", async () => {
        const [first] = await twoEntities();
        const element = document.createElement("div");
        expect(attach(element, first)).toBe(element);
        expect(entityOfElement(element)).toBe(first);
        document.body.append(element);
        expect(foundFor(element)).toBe(first);
    });

    it("find the first target on the composed path showing one, from where it was dispatched, through open shadow roots", async () => {
        const [outer, inner] = await twoEntities();
        /** A host showing `outer`, with a shadow root holding a span showing `inner`, its button, and a paragraph. */
        const shadowed = (mode: ShadowRootMode) => {
            const host = attach(document.createElement("div"), outer);
            const root = host.attachShadow({ mode });
            const button = document.createElement("button");
            const plain = document.createElement("p");
            root.append(attach(document.createElement("span"), inner), plain);
            root.firstElementChild?.append(button);
            document.body.append(host);
            return { host, button, plain };
        };
        const open = shadowed("open");
        expect([foundFor(open.button), foundFor(open.plain), foundFor(open.host)]).toEqual([inner, outer, outer]);
        // A closed root's nodes aren't on the path a listener outside it sees.
        const closed = shadowed("closed");
        expect([foundFor(closed.button), foundFor(closed.plain), foundFor(closed.host)]).toEqual([outer, outer, outer]);
    });

    it("give none for elements and events showing none, and for null", () => {
        const element = document.createElement("div");
        document.body.append(element);
        expect(entityOfElement(element)).toBe(Entity.none);
        expect(entityOfElement(null)).toBe(Entity.none);
        expect(foundFor(element)).toBe(Entity.none);
        // After dispatch the composed path is empty.
        const event = new CustomEvent("attach-test", { bubbles: true, composed: true });
        attach(element, Entity.none).dispatchEvent(event);
        expect(entityOf(event)).toBe(Entity.none);
    });
});
