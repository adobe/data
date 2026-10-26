// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { World } from './world.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

declare const world: World;
declare const channel: MessageChannel;
declare const worker: Worker;

// Sharing lets another thread join through a port: a MessagePort, a Worker or a worker's own scope. It resolves once
// that thread has joined, to nothing.
const shared: Promise<void> = world.share(channel.port1);
check<Equal<ReturnType<World["share"]>, Promise<void>>>();
world.share(worker);
world.share(self);
// A port is share's parameter, inferred where a consumer names it.
const port: Parameters<World["share"]>[0] = channel.port2;
// @ts-expect-error a port posts messages to another thread
world.share({});
// @ts-expect-error a thread is shared through one port
world.share();

// The package root's World.join joins; World names no type for it, its options or its port.
// @ts-expect-error no World.Join
export type Joining = World.Join;
// @ts-expect-error no World.JoinOptions
export type Options = World.JoinOptions;
// @ts-expect-error no World.Port
export type Ported = World.Port;
void [shared, port];
