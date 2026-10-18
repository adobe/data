import type { Entity } from '../entity/entity.js';
import { threadClaims, threadStatus } from '../components/index.js';
import { main } from '../system/system.type-test.js';
import type { World } from './world.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

declare const world: World;
declare const join: World.Join;
declare const channel: MessageChannel;
declare const worker: Worker;

// Sharing lets another thread join through a port: a MessagePort, a Worker or a worker's own scope.
const thread: Entity = world.share(channel.port1);
world.share(worker);
world.share(self);
const port: World.Port = channel.port2;
// @ts-expect-error a port posts messages to another thread
world.share({});
// @ts-expect-error a thread is shared through one port
world.share();

// Joining gives a world: runs and observers work as on the world's thread.
const joined: World = join(channel.port2, { threads: ["main"] });
join(worker);
join(self, {});
join(port, { threads: [] });
const ran: Promise<World.Report> = joined.run(main);
// @ts-expect-error a joined thread fills logical threads other than the world's
join(port, { threads: ["world"] });
// @ts-expect-error it claims declared threads
join(port, { threads: ["elsewhere"] });
// @ts-expect-error it joins through a port
join({ threads: ["main"] });
check<Equal<ReturnType<World.Join>, World>>();

// The thread's entity shows its progress and claims, which only the world writes.
world.observe.entity(thread, { required: [threadStatus], optional: [threadClaims] })(value => {
    if (value === null) return;
    const status: "joining" | "joined" | "gone" = value[threadStatus];
    const claims: readonly string[] | undefined = value[threadClaims];
    // @ts-expect-error a status is one of three
    const other: "left" = value[threadStatus];
    void [status, claims, other];
});
void [ran];
