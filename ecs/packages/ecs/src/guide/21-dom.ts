// © 2026 Adobe. MIT License. See /LICENSE for details.
import { always, cadence, clock, Finalizer, System, Vec2, World } from "../index.js";

const position = Symbol();
const velocity = Symbol();
const traced = Symbol();
const dot = Symbol();
const stage = Symbol();
const tracing = Symbol();

/** An element showing a particle, as the systems drawing use it. */
type Dot = { readonly style: { translate: string; background: string }; readonly remove: () => void };
/** Where particles are drawn: an element of the page, or a stand-in where there's no page. */
type Stage = { readonly add: () => Dot; readonly count: () => number };

declare module "@adobe/ecs" {
    interface Components {
        // Percents of the stage's width and height.
        [position]: { type: Vec2 };
        [velocity]: { type: Vec2 };
        [traced]: { type: true };
        [dot]: { type: Dot; thread: "main" };
    }
    interface Resources {
        [stage]: { type: Stage | null; thread: "main" };
        // Called with each frame of the traced particle's dot.
        [tracing]: { type: ((frame: number, dot: Dot) => void) | null; thread: "main" };
    }
}

const spawn = System.create(({ commands }) => {
    commands.spawn([position, velocity, traced])({ [position]: [98, 50], [velocity]: [1.5, -0.75] });
    for (let i = 1; i < 60; i++) {
        commands.spawn([position, velocity])({ [position]: [(i * 37) % 100, (i * 61) % 100], [velocity]: [Math.cos(i * 2.4) * 0.6, Math.sin(i * 2.4) * 0.6] });
    }
});

// Each tick moves every particle by its velocity, turning it back from the walls.
const move = System.create({ components: { with: [position, velocity] } }, row => {
    const [x, y] = Vec2.add(row[position], row[velocity]);
    const [vx, vy] = row[velocity];
    row[velocity] = [x < 0 || x > 100 ? -vx : vx, y < 0 || y > 100 ? -vy : vy];
    row[position] = [Math.min(Math.max(x, 0), 100), Math.min(Math.max(y, 0), 100)];
});

// Gives each particle a dot: not an observer, since it issues commands.
const create = System.create({ components: { with: [position], not: [dot] }, resources: { is: [stage] } }, (row, { resources, commands }) => {
    const element = resources[stage].add();
    element.style.background = `hsl(${row.entity * 47 % 360} 80% 60%)`;
    commands.add(row.entity, dot, element);
});
// Moves each dot whose particle moved, by a transform, which the page doesn't lay out again.
const draw = System.create({
    observer: true,
    components: { with: [position, dot], optional: [traced], changed: [position] },
}, (row, { resources }) => {
    const [x, y] = row[position];
    row[dot].style.translate = `${x}cqw ${y}cqh`;
    if (row[traced] !== undefined) resources[tracing]?.(resources[clock].tick + 1, row[dot]);
});
Finalizer.create({ components: { with: [dot] } }, row => {
    row[dot].remove();
});

const despawnTraced = System.create({ components: { with: [traced] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});

/** The page's `#output`: dots move inside a field a dot's radius in from its edges, by percents of it. */
const pageStage = (output: HTMLElement): Stage => {
    const field = output.appendChild(document.createElement("div"));
    field.style.cssText = "position: absolute; inset: 6px; container-type: size";
    return {
        add: () => {
            const element = field.appendChild(document.createElement("div"));
            element.style.cssText = "position: absolute; width: 12px; height: 12px; margin: -6px; border-radius: 50%";
            return element;
        },
        count: () => field.childElementCount,
    };
};

/** Where there's no page, as in node: dots that keep what's written to them. */
const standIn = (): Stage => {
    const dots = new Set<Dot>();
    return {
        add: () => {
            const added: Dot = { style: { translate: "", background: "" }, remove: () => void dots.delete(added) };
            dots.add(added);
            return added;
        },
        count: () => dots.size,
    };
};

export const main = async (): Promise<void> => {
    // The guide's Output tab has an element #output; elsewhere, as in node, there's none.
    const output = globalThis.document?.querySelector<HTMLElement>("#output") ?? null;
    const shown = output === null ? standIn() : pageStage(output);
    const traceDone = Promise.withResolvers<void>();
    const logFrame = (frame: number, traced: Dot): void => {
        if (frame > 3) return;
        console.log(`frame ${frame}: ${traced.style.translate}`);
        if (frame === 3) traceDone.resolve();
    };
    // 60 ticks a second, whatever the display's rate.
    await using world = World.create({ [cadence]: { kind: "fixed", step: 1000 / 60 }, [always]: true, [stage]: shown, [tracing]: logFrame });
    await world.run(spawn);
    world.add(System.create([move, create, draw]));
    // The first three frames, or two seconds should they never be drawn.
    await Promise.race([traceDone.promise, new Promise(resolve => setTimeout(resolve, 2000))]);
    console.log(shown.count(), "dots drawn");
    await world.run(despawnTraced);
    console.log(shown.count(), "dots once the traced particle is gone");
    // In a page it animates until the page goes; elsewhere it ends, its world disposed.
    if (output !== null) await new Promise(resolve => addEventListener("pagehide", resolve));
};
