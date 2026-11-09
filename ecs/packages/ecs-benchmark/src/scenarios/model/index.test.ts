// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System, World, workers } from "@adobe/ecs";
import { describe, expect, it } from "vitest";
import {
    complexSystemsUpdate, createEntities, createHalfComponentEntities, createMixedUpdateEntities, createUpdateEntities,
    destroyEntities, destroyEntitiesWhere, probeEntities, probeFullEntities, removeAddComponent, systemsUpdate, unpackOneComponent,
    unpackThreeComponents, unpackTwoComponents,
} from "./index.js";
import { mixedUpdateEntities, next, generator, type Reference, update, updateEntities } from "./reference.test-helper.js";
import { damage } from "./shared/component.damage.js";
import { data } from "./shared/component.data.js";
import { health } from "./shared/component.health.js";
import { player } from "./shared/component.player.js";
import { position } from "./shared/component.position.js";
import { sprite } from "./shared/component.sprite.js";
import { velocity } from "./shared/component.velocity.js";
import { checksum } from "./shared/resource.checksum.js";
import { defaultData } from "./shared/constant.default-data.js";
import { frameBuffer } from "./shared/constant.frame-buffer.js";
import { playerSeed } from "./shared/function.player-seed.js";
import { randomRange } from "./shared/function.random-range.js";
import { seedRandom } from "./shared/function.seed-random.js";

/** Where kernels run: in JS, as without cross-origin isolation, in WASM on the world's thread, or on two workers. */
const lanes = ["js", "wasm", "threads"] as const;

/** A world of `lane`, used by `use` and disposed. */
const using = async <T>(lane: (typeof lanes)[number], use: (world: World) => Promise<T>): Promise<T> => {
    if (lane === "js") Object.defineProperty(globalThis, "crossOriginIsolated", { value: false, configurable: true });
    const world = World.create({ [workers]: lane === "threads" ? 2 : 0 });
    if (lane === "js") Reflect.deleteProperty(globalThis, "crossOriginIsolated");
    try {
        return await use(world);
    }
    finally {
        await world.dispose();
    }
};

const read = <T>(rows: Map<Entity, T>, entity: Entity): T | undefined => rows.get(entity);

/** Every entity's components, as the reference holds them, by reading each component's rows. */
const stateOf = async (world: World, entities: readonly Entity[]): Promise<Reference[]> => {
    const positions = new Map<Entity, { x: number; y: number }>();
    const velocities = new Map<Entity, { x: number; y: number }>();
    const datas = new Map<Entity, Reference["data"]>();
    const players = new Map<Entity, Reference["player"]>();
    const healths = new Map<Entity, Reference["health"]>();
    const damages = new Map<Entity, Reference["damage"]>();
    const sprites = new Map<Entity, Reference["sprite"]>();
    await world.run(System.create({ readonly: true, components: { with: [position] } }, row => { positions.set(row.entity, { ...row[position] }); }));
    await world.run(System.create({ readonly: true, components: { with: [velocity] } }, row => { velocities.set(row.entity, { ...row[velocity] }); }));
    await world.run(System.create({ readonly: true, components: { with: [data] } }, row => {
        const value = row[data];
        datas.set(row.entity, { ...value, rng: { state: [value.rng[0], value.rng[1], value.rng[2], value.rng[3]] } });
    }));
    await world.run(System.create({ readonly: true, components: { with: [player] } }, row => { players.set(row.entity, { rng: { state: [row[player].rng[0], row[player].rng[1], row[player].rng[2], row[player].rng[3]] }, type: row[player].type }); }));
    await world.run(System.create({ readonly: true, components: { with: [health] } }, row => { healths.set(row.entity, { ...row[health] }); }));
    await world.run(System.create({ readonly: true, components: { with: [damage] } }, row => { damages.set(row.entity, { ...row[damage] }); }));
    await world.run(System.create({ readonly: true, components: { with: [sprite] } }, row => { sprites.set(row.entity, { ...row[sprite] }); }));
    return entities.map(entity => {
        const found: Reference = {
            position: read(positions, entity), velocity: read(velocities, entity), data: read(datas, entity), player: read(players, entity),
            health: read(healths, entity), damage: read(damages, entity), sprite: read(sprites, entity),
        };
        return Object.fromEntries(Object.entries(found).filter(([, value]) => value !== undefined));
    });
};

const countOf = async (world: World): Promise<{ readonly both: number; readonly velocityOnly: number }> => {
    let both = 0;
    let velocityOnly = 0;
    await world.run(System.create({ readonly: true, components: { with: [velocity], optional: [position] } }, row => {
        if (row[position] === undefined) velocityOnly++;
        else if (row[position].x === 0 && row[position].y === 0) both++;
    }));
    return { both, velocityOnly };
};

const readChecksum = System.create({ readonly: true }, ({ resources }) => resources[checksum]);

const frames = 25;

describe("the scenarios", () => {
    it("step the generator as random_xoshiro128 does", () => {
        // What the suite's random.h gives, compiled with clang.
        const rng = generator(340383);
        expect([next(rng), next(rng), next(rng), next(rng)]).toEqual([1960634880, 1960611840, 3117724897, 4146437857]);
        const first = randomRange(seedRandom(340383), 0, 0xFFFFFFFE);
        expect(first.value).toBe(1960634880);
        let state = seedRandom(7);
        const draws: number[] = [];
        for (let i = 0; i < 3; i++) {
            const step = randomRange(state, 1, 100);
            draws.push(step.value);
            state = step.state;
        }
        expect(draws).toEqual([21, 81, 81]);
    });

    it("start data as DataComponent's constructor does", () => {
        const rng = generator(340383);
        const numgy = next(rng);
        expect(defaultData).toEqual({ thingy: 0, dingy: 0, mingy: false, seed: 340383, rng: rng.state, numgy });
    });

    for (const lane of lanes) {
        for (const [label, create, reference] of [["uniform", createUpdateEntities, updateEntities], ["mixed", createMixedUpdateEntities, mixedUpdateEntities]] as const) {
            for (const [systems, frame, complex] of [[2, systemsUpdate, false], [7, complexSystemsUpdate, true]] as const) {
                for (const count of [99, 1000, 40000]) {
                    it(`compute what the suite's ${systems} systems do over ${count} ${label} entities, frame by frame (${lane})`, async () => {
                        const expected = reference(count, playerSeed);
                        // Entities drawn at one cell in one frame overwrite each other in the order a library stores them, so each
                        // cell holds one of the characters drawn there in the last frame that drew it.
                        const drawn = new Map<number, { frame: number; characters: Set<number> }>();
                        frameBuffer.fill(0);
                        await using(lane, async world => {
                            const entities = await world.run(create, { count });
                            expect(await stateOf(world, entities)).toEqual(expected);
                            for (let i = 0; i < frames; i++) {
                                await world.run(frame);
                                update(expected, complex, (cell, character) => {
                                    const last = drawn.get(cell);
                                    if (last !== undefined && last.frame === i) last.characters.add(character);
                                    else drawn.set(cell, { frame: i, characters: new Set([character]) });
                                });
                            }
                            expect(await stateOf(world, entities)).toEqual(expected);
                        });
                        const misdrawn = [...frameBuffer].flatMap((character, cell) => {
                            const candidates = drawn.get(cell)?.characters ?? new Set([0]);
                            return candidates.has(character) ? [] : [{ cell, character, candidates: [...candidates] }];
                        });
                        expect(misdrawn).toEqual([]);
                        expect(drawn.size > 0).toBe(complex);
                    });
                }
            }
        }

        it(`create, remove and add back, and destroy the entities they're asked to (${lane})`, async () => {
            await using(lane, async world => {
                await world.run(createEntities, { count: 1000 });
                expect(await countOf(world)).toEqual({ both: 1000, velocityOnly: 0 });
                await world.run(removeAddComponent);
                expect(await countOf(world)).toEqual({ both: 1000, velocityOnly: 0 });
                await world.run(destroyEntities);
                expect(await countOf(world)).toEqual({ both: 0, velocityOnly: 0 });
                await world.run(createEntities, { count: 1000 });
                await world.run(destroyEntitiesWhere);
                expect(await countOf(world)).toEqual({ both: 0, velocityOnly: 0 });
            });
        });

        it(`get one, two and three components of each probe's entity (${lane})`, async () => {
            await using(lane, async world => {
                await world.run(createEntities, { count: 1000 });
                await world.run(probeEntities);
                await world.run(unpackOneComponent);
                expect(await world.run(readChecksum)).toBe(0);
                await world.run(unpackTwoComponents);
                expect(await world.run(readChecksum)).toBe(2000);
            });
            await using(lane, async world => {
                await world.run(createHalfComponentEntities, { count: 1000 });
                await world.run(probeFullEntities);
                await world.run(unpackThreeComponents);
                const { thingy, dingy, seed, rng, numgy } = defaultData;
                const each = 2 + thingy + dingy + seed + rng[0] + rng[1] + rng[2] + rng[3] + numgy;
                expect(await world.run(readChecksum)).toBe(500 * each);
            });
        });
    }
});
