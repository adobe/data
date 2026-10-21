import type { Component } from '../component/component.js';
import * as resources from '../resources/index.js';
import { System } from '../system/system.js';
import { main, watchTime } from '../system/system.type-test.js';
import type { World } from '../world/world.js';
import { Report } from './report.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

declare const world: World;

// Each key is a component, declared under its namespaced computed key.
type Run = {
    readonly number: number;
    readonly elapsed: number;
    readonly systems: number;
    readonly workers: number;
    readonly joined: number;
    readonly main: boolean;
    readonly gpu: boolean;
    readonly dropped: number;
};
type Errors = { readonly failures: readonly Report.Failure[]; readonly skipped: readonly string[]; readonly warnings: readonly Report.Warning[] };
check<Equal<Component.Value<typeof Report.run>, Run>>();
check<Equal<Component.Value<typeof Report.errors>, Errors>>();
check<Equal<typeof Report.Archetype, readonly [typeof Report.run]>>();

// A failure and a warning, as data.
declare const failure: Report.Failure;
check<Equal<typeof failure.kind, "system" | "finalizer" | "gpu" | "thread" | "index">>();
check<Equal<typeof failure.stack, string | null>>();
check<Equal<Report.Warning, { readonly kind: "blocking"; readonly name: string; readonly message: string }>>();

// A report's values: errors only when something went wrong.
check<Equal<Report, { readonly [Report.run]: Run; readonly [Report.errors]?: Errors }>>();

// An observer system follows reports by their components.
const logged: Report.Failure[] = [];
export const logger = System.create({ observer: true, components: { read: [Report.run, Report.errors], changed: [Report.errors] } }, row => {
    const number: number = row[Report.run].number;
    for (const each of row[Report.errors].failures) logged.push(each);
    // @ts-expect-error a report's lists are read-only
    row[Report.errors].failures.push(logged[0]);
    void number;
});
export const timings = System.create({ observer: true, components: { read: [Report.run], changed: [Report.run] } }, row => {
    const { elapsed, systems, workers, joined, main: onMain, gpu, dropped } = row[Report.run];
    void [elapsed, systems, workers, joined, onMain, gpu, dropped];
});

// A run resolves to its number; a rejected run rejects.
const ran: Promise<number> = world.run(main);
const observed: Promise<number> = world.run(watchTime);
void [ran, observed];
// @ts-expect-error no index by run: indexes key on whole components
void Report.byRun;
// @ts-expect-error no failures component: they're in errors
void Report.failures;
// @ts-expect-error no World.Report: a report is entities
export type Reported = World.Report;
// @ts-expect-error no report resource: reports are entities
void resources.report;
