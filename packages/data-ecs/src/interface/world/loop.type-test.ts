import {
    Finalizer, System, always, cadence, clock, gpuDevice, report, threadClaims, threadPort, threadStatus, wake, workers,
    type Cadence, type Component, type Resource, type Thread, type World,
} from '../index.js';
import { main, move } from '../system/system.type-test.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

declare const world: World;
declare const create: World.Create;
declare const port: MessagePort;

// Systems added to every tick take no input.
const added: void = world.add(main);
// @ts-expect-error a system with input can't be added, since ticks pass none
world.add(move);
// Another thread joins this world through a port.
const shared: void = world.share(port);
// @ts-expect-error share takes a MessagePort
world.share({});
void [added, shared];

// Built-in resources.
check<Equal<Resource.Value<typeof gpuDevice>, GPUDevice | null>>();
check<Equal<Resource.Value<typeof workers>, number>>();
check<Equal<Resource.Value<typeof cadence>, Cadence>>();
check<Equal<Resource.Value<typeof always>, boolean>>();
check<Equal<Resource.Value<typeof wake>, number>>();
check<Equal<Resource.Value<typeof clock>, { readonly now: number; readonly delta: number; readonly tick: number }>>();
check<Equal<Resource.Value<typeof report>, World.Report>>();
check<Equal<Cadence, { readonly kind: "frame" } | { readonly kind: "fixed"; readonly step: number; readonly maxSteps?: number }>>();

// Built-in components, one entity per joined thread.
check<Equal<Component.Value<typeof threadPort>, MessagePort>>();
check<Equal<Component.Value<typeof threadClaims>, readonly Thread[]>>();
check<Equal<Component.Value<typeof threadStatus>, "joining" | "joined" | "gone">>();

// Systems read the loop's state, ask for a wake time and change its cadence.
System.create({ name: "loopTypeTest/read", resources: { read: [clock, report] } }, ({ resources }) => {
    const now: number = resources[clock].now;
    const failures: number = resources[report].failures.length;
    void [now, failures];
});
System.create({ name: "loopTypeTest/pace", resources: { write: [cadence, always] } }, ({ resources }) => {
    resources[cadence] = { kind: "fixed", step: 1000 / 60, maxSteps: 2 };
    resources[always] = true;
});
System.create({ name: "loopTypeTest/sleep", reduce: { [wake]: "min" } }, ({ reduce }) => { reduce[wake](1000); });
// @ts-expect-error clock is written only by the world
System.create({ name: "loopTypeTest/clock", resources: { write: [clock] } }, () => {});
// @ts-expect-error report is written only by the world
System.create({ name: "loopTypeTest/report", resources: { write: [report] } }, () => {});
// @ts-expect-error wake is reduced, never written
System.create({ name: "loopTypeTest/wake", resources: { write: [wake] } }, () => {});
// @ts-expect-error a finalizer doesn't write clock either
Finalizer.create({ name: "loopTypeTest/finalizeClock", components: {}, resources: { write: [clock] } }, () => {});
// @ts-expect-error a cadence is a frame or a fixed step
System.create({ name: "loopTypeTest/badCadence", resources: { write: [cadence] } }, ({ resources }) => { resources[cadence] = { kind: "fixed" }; });

// Worlds start the loop's settings at other values; clock and report are the world's own.
const paced: World = create({ [cadence]: { kind: "fixed", step: 10 }, [always]: true, [workers]: 2 });
// @ts-expect-error clock is written only by the world
create({ [clock]: { now: 0, delta: 0, tick: 0 } });
// @ts-expect-error report is written only by the world
create({ [report]: { failures: [], skipped: [], dropped: 0 } });
void paced;
