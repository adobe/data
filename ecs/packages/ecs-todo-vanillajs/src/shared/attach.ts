// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/ecs";

/** The key an element holds the entity it shows under: only `attach` writes it. */
const shown: unique symbol = Symbol("shown");

/** An element showing an entity. */
type Attached = { readonly [shown]: Entity };

/**
 * Records on `element` the entity it shows, for events from it, where the element is made for that entity, and
 * returns it. Elements are never reused, so it's written once and lives as long as the element.
 */
export const attach = <E extends Element>(element: E, entity: Entity): E & Attached => Object.assign(element, { [shown]: entity });

/** The entity a target shows, or none for one that shows none. */
const shownBy = (target: EventTarget | Attached | null): Entity => target !== null && shown in target ? target[shown] : Entity.none;

/** The entity an element shows, as `todo-move`'s `item` and `before` name them, or none for null or one that shows none. */
export const entityOfElement = (element: Element | null): Entity => shownBy(element);

/**
 * The entity the first target on an event's composed path shows, from where it was dispatched outward, or none when no
 * target shows one. Read while the event dispatches, as listeners do: the path is empty after.
 */
export const entityOf = (event: Event): Entity => {
    const path = event.composedPath();
    for (let k = 0; k < path.length; k++) {
        const found = shownBy(path[k]);
        if (found !== Entity.none) return found;
    }
    return Entity.none;
};
