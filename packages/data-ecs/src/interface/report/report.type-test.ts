import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import * as resources from '../resources/index.js';
import { System } from '../system/system.js';
import { main, watchTime } from '../system/system.type-test.js';
import type { World } from '../world/world.js';
import { Report } from './report.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

declare const world: World;

// Each key is a component, declared under its namespaced computed key.
check<Equal<Component.Value<typeof Report.run>, number>>();
check<Equal<Component.Value<typeof Report.failures>, readonly Report.Failure[]>>();
check<Equal<Component.Value<typeof Report.skipped>, readonly string[]>>();
check<Equal<Component.Value<typeof Report.dropped>, number>>();
check<Equal<Component.Value<typeof Report.warnings>, readonly Report.Warning[]>>();
check<Equal<typeof Report.Archetype, readonly [typeof Report.run, typeof Report.failures, typeof Report.skipped, typeof Report.dropped, typeof Report.warnings]>>();

// A failure and a warning, as data.
declare const failure: Report.Failure;
check<Equal<typeof failure.kind, "system" | "finalizer" | "gpu" | "thread" | "index">>();
check<Equal<typeof failure.stack, string | null>>();
check<Equal<Report.Warning, { readonly kind: "blocking"; readonly name: string; readonly message: string }>>();

// A report's values, as rows and lookups give them.
check<Equal<Report, {
    readonly [Report.run]: number;
    readonly [Report.failures]: readonly Report.Failure[];
    readonly [Report.skipped]: readonly string[];
    readonly [Report.dropped]: number;
    readonly [Report.warnings]: readonly Report.Warning[];
}>>();

// An observer system follows reports by their components, and one-off reads find a run's by its number.
const logged: Report.Failure[] = [];
export const logger = System.create({ observer: true, components: { read: [Report.run, Report.failures], changed: [Report.failures] } }, row => {
    const run: number = row[Report.run];
    for (const each of row[Report.failures]) logged.push(each);
    // @ts-expect-error a report's lists are read-only
    row[Report.failures].push(logged[0]);
    void run;
});
let found: Report | null = null;
export const reportOf = System.create({ observer: true, lookup: { reports: { index: Report.byRun, read: Report.Archetype } } }, ({ lookup }) => {
    const row = lookup.reports(1);
    found = row;
    const entity: Entity | undefined = row?.entity;
    const older = lookup.reports({ "<": 10 });
    for (let i = 0; i < older.length; i++) void older.at(i)[Report.run];
    void entity;
});
void found;

// A run resolves to its number; a rejected run rejects.
const ran: Promise<number> = world.run(main);
const observed: Promise<number> = world.run(watchTime);
void [ran, observed];
// @ts-expect-error no World.Report: a report is entities
export type Reported = World.Report;
// @ts-expect-error no World.Run: a run's result is a number
export type Ran = World.Run;
// @ts-expect-error no report resource: reports are entities
void resources.report;
