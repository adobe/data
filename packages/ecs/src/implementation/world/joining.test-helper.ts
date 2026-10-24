// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "../../interface/system/system.js";
import { Observe } from "../../observe/index.js";
import type { World } from "../../interface/world/world.js";
import { reportOf } from "./reports.test-helper.js";

// Keys and systems both threads of the joining fixtures import, and the scenario a joined thread drives.

export const point = Symbol("joiningTest/point");
export const label = Symbol("joiningTest/label");
export const marked = Symbol("joiningTest/marked");
export const total = Symbol("joiningTest/total");
export const names = Symbol("joiningTest/names");
declare module "@adobe/ecs" {
    export interface Components {
        [point]: { type: readonly [number, number] };
        [label]: { type: string };
        [marked]: { type: true };
    }
    export interface Resources {
        [total]: { type: number; default: 0 };
        [names]: { type: readonly string[]; default: [] };
    }
}

/** Appends a digit to `total`, so the order of runs shows in it. */
export const add = System.create({ resources: { write: [total] } }, ({ resources }, input: { readonly amount: number }) => {
    resources[total] = resources[total] * 10 + input.amount;
});
export const append = System.create({ resources: { write: [names] } }, ({ resources }, input: { readonly name: string }) => {
    resources[names] = [...resources[names], input.name];
});
export const spawn = System.create({}, ({ commands }, input: { readonly x: number }) => {
    commands.spawn([point, label, marked])({ [point]: [input.x, -input.x], [label]: `p${input.x}` });
});
export const fail = System.create({}, () => { throw new Error("joiningTest failure"); });
export const idle = System.create({}, () => {});

/** The first value an observer gives that `accept` takes. */
export const until = <T>(observe: Observe<T>, accept: (value: T) => boolean): Promise<T> => new Promise(resolve => {
    let done = false;
    const stop = observe(value => {
        if (done || !accept(value)) return;
        done = true;
        queueMicrotask(() => stop());
        resolve(value);
    });
});

/**
 * What a joined thread sees driving a world: runs in call order with struct and object input, by number, a failing
 * run's number, observers of a resource, a selection, a count and an entity's listed components, and the
 * rejections of a system the world never imported and of one without an id.
 */
export const drive = async (remote: World, unimported: System<void>) => {
    const runs = await Promise.all([
        remote.run(add, { amount: 1 }), remote.run(append, { name: "a" }), remote.run(add, { amount: 2 }), remote.run(append, { name: "b" }), remote.run(add, { amount: 3 }),
    ]);
    const failed = await remote.run(fail);
    await remote.run(spawn, { x: 1 });
    await remote.run(spawn, { x: 2 });
    const observedTotal = await until(Observe.resource(remote, total), value => value === 123);
    const selected = await until(Observe.select(remote, { required: [point], order: { [point]: false } }), entities => entities.length === 2);
    const counted = await until(Observe.count(remote, { required: [point], where: { [point]: [2, -2] } }), count => count === 1);
    const listed = await until(Observe.entity(remote, selected[0], { required: [point], optional: [marked] }), value => value !== null);
    const rejected = (run: Promise<unknown>): Promise<string> => run.then(() => "ran", (error: unknown) => error instanceof Error ? error.message : String(error));
    return {
        runs,
        failed,
        total: observedTotal,
        selected: selected.length,
        counted,
        listed: listed === null ? null : [listed[point], listed[marked]],
        unimported: await rejected(remote.run(unimported)),
        unnamed: await rejected(remote.run(System.create(() => {}))),
    };
};
export type Driven = Awaited<ReturnType<typeof drive>>;

/** What a joined thread saw driving a world, its runs' reports read on the world's thread, which holds them. */
export const withReports = async (world: World, { runs, failed, ...driven }: Driven) => ({
    ...driven,
    reports: await Promise.all(runs.map(run => reportOf(world, run))),
    failures: (await reportOf(world, failed)).failures.map(failure => failure.message),
});
export type Reported = Awaited<ReturnType<typeof withReports>>;
