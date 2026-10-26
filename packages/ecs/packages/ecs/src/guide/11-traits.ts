// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, System, World } from "../index.js";

const ship = Symbol();
const parent = Symbol();
const target = Symbol();
const selected = Symbol();
const outline = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [ship]: { type: true };
        // Despawned with the entity it points to.
        [parent]: { type: Entity; reference: "owner" };
        // Removed when the entity it points to despawns.
        [target]: { type: Entity; reference: "weak" };
        [selected]: { type: true };
        // Removed with selected.
        [outline]: { type: number; within: typeof selected };
    }
}

const spawn = System.create(({ commands }) => {
    const mothership = commands.spawn([ship, selected, outline])({ [outline]: 2 });
    commands.spawn([parent])({ [parent]: mothership });
    commands.spawn([target])({ [target]: mothership });
});
const deselect = System.create({ components: { with: [selected] } }, (row, { commands }) => {
    commands.remove(row.entity, selected);
});
const destroy = System.create({ components: { with: [ship] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});

const counts = { outlined: 0, targeting: 0, entities: 0 };
const countOutlined = System.create({ observer: true, components: { with: [outline] } }, () => { counts.outlined += 1; });
const countTargeting = System.create({ observer: true, components: { with: [target] } }, () => { counts.targeting += 1; });
const countAll = System.create({ observer: true, components: {} }, () => { counts.entities += 1; });
const count = System.create([countOutlined, countTargeting, countAll]);

export const main = async (): Promise<void> => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(deselect);
    await world.run(count);
    console.log(counts);
    counts.outlined = counts.targeting = counts.entities = 0;
    await world.run(destroy);
    await world.run(count);
    console.log(counts);
};
