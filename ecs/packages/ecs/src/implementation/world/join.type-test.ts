// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { World } from '../../interface/world/world.js';
import { System } from '../../interface/system/system.js';
import { join } from './create.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

declare const channel: MessageChannel;
declare const worker: Worker;
declare const port: Parameters<World["share"]>[0];

// Joining resolves to a world once its claims are made: runs work as on the world's thread.
const joining: Promise<World> = join(channel.port2, { threads: ["main"] });
declare const joined: Awaited<typeof joining>;
join(worker);
join(self, {});
join(port, { threads: [] });
const ran: Promise<number> = joined.run(System.create({}, () => 1));
// @ts-expect-error a joined thread fills logical threads other than the world's
join(port, { threads: ["world"] });
// @ts-expect-error it claims declared threads
join(port, { threads: ["elsewhere"] });
// @ts-expect-error it joins through a port
join({ threads: ["main"] });
// It joins through what the world shares through.
check<Equal<Parameters<typeof join>[0], Parameters<World["share"]>[0]>>();
check<Equal<ReturnType<typeof join>, Promise<World>>>();
void [joining, ran];
