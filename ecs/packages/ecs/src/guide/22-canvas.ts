// © 2026 Adobe. MIT License. See /LICENSE for details.
import { always, cadence, clock, Index, System, Vec2, World } from "../index.js";

const position = Symbol();
const velocity = Symbol();
const traced = Symbol();
const pen = Symbol();
const tracing = Symbol();

/** What the drawing system uses of a canvas's 2D context, which a stand-in gives where there's no page. */
type Pen = {
    readonly canvas: { width: number; height: number; readonly clientWidth: number; readonly clientHeight: number };
    fillStyle: string | CanvasGradient | CanvasPattern;
    clearRect(x: number, y: number, width: number, height: number): void;
    beginPath(): void;
    arc(x: number, y: number, radius: number, start: number, end: number): void;
    fill(): void;
    getImageData(x: number, y: number, width: number, height: number): { readonly data: ArrayLike<number> };
};

declare module "@adobe/ecs" {
    interface Components {
        // Percents of the canvas's width and height.
        [position]: { type: Vec2 };
        [velocity]: { type: Vec2 };
        [traced]: { type: true };
    }
    interface Resources {
        [pen]: { type: Pen | null; thread: "main" };
        // Called with each frame drawn, and where the traced particle was drawn, in the canvas's pixels.
        [tracing]: { type: ((frame: number, at: Vec2) => void) | null; thread: "main" };
    }
}

const spawn = System.create(({ commands }) => {
    commands.spawn([position, velocity, traced])({ [position]: [98, 50], [velocity]: [1.5, -0.75] });
    for (let i = 1; i < 400; i++) {
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

const particles = Index.create({ key: [], components: { with: [position] } });
const tracedOnes = Index.create({ key: [], components: { with: [position, traced] } });
// Clears the canvas and draws every particle, after each tick.
const draw = System.create({
    observer: true,
    resources: { is: [pen], changed: [clock] },
    lookup: { particles: { index: particles }, traced: { index: tracedOnes } },
}, ({ resources, lookup }) => {
    const context = resources[pen];
    const { canvas } = context;
    // The canvas's pixels follow its size on the page.
    const scale = globalThis.devicePixelRatio ?? 1;
    const width = Math.round(canvas.clientWidth * scale);
    const height = Math.round(canvas.clientHeight * scale);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const radius = 4 * scale;
    const at = ([x, y]: Vec2): Vec2 => [radius + x / 100 * (width - 2 * radius), radius + y / 100 * (height - 2 * radius)];
    context.clearRect(0, 0, width, height);
    const list = lookup.particles();
    for (let i = 0; i < list.length; i++) {
        const particle = list.at(i);
        const [x, y] = at(particle[position]);
        context.fillStyle = `hsl(${particle.entity * 47 % 360} 80% 60%)`;
        context.beginPath();
        context.arc(x, y, radius, 0, 2 * Math.PI);
        context.fill();
    }
    const followed = lookup.traced();
    if (followed.length > 0) resources[tracing]?.(resources[clock].tick + 1, at(followed.at(0)[position]));
});

/** Where there's no page, as in node: a canvas of a fixed size that keeps the circles filled since it was last cleared. */
const standIn = (): Pen => {
    const filled: { readonly x: number; readonly y: number; readonly radius: number }[] = [];
    let path = { x: 0, y: 0, radius: 0 };
    return {
        canvas: { width: 0, height: 0, clientWidth: 400, clientHeight: 300 },
        fillStyle: "",
        clearRect: () => void filled.splice(0),
        beginPath: () => void (path = { x: 0, y: 0, radius: 0 }),
        arc: (x, y, radius) => void (path = { x, y, radius }),
        fill: () => void filled.push(path),
        getImageData: (x, y) => ({ data: [0, 0, 0, filled.some(circle => Math.hypot(circle.x - x, circle.y - y) < circle.radius) ? 255 : 0] }),
    };
};

export const main = async (): Promise<void> => {
    // The guide's Output tab has an element #output; elsewhere, as in node, there's none.
    const output = globalThis.document?.querySelector<HTMLElement>("#output") ?? null;
    const canvas = output?.appendChild(document.createElement("canvas")) ?? null;
    canvas?.setAttribute("style", "display: block; width: 100%; height: 100%");
    const context = canvas === null ? standIn() : canvas.getContext("2d");
    const traceDone = Promise.withResolvers<void>();
    const logFrame = (frame: number, [x, y]: Vec2): void => {
        if (frame > 3 || context === null) return;
        // Whether the traced particle's place is drawn on: its pixel's opacity.
        const covered = context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data[3] === 255;
        console.log(`frame ${frame}: the traced particle is ${covered ? "drawn" : "missing"}`);
        if (frame === 3) traceDone.resolve();
    };
    // 60 ticks a second, whatever the display's rate.
    await using world = World.create({ [cadence]: { kind: "fixed", step: 1000 / 60 }, [always]: true, [pen]: context, [tracing]: logFrame });
    await world.run(spawn);
    world.add(System.create([move, draw]));
    // The first three frames, or two seconds should they never be drawn.
    await Promise.race([traceDone.promise, new Promise(resolve => setTimeout(resolve, 2000))]);
    // In a page it animates until the page goes; elsewhere it ends, its world disposed.
    if (canvas !== null) await new Promise(resolve => addEventListener("pagehide", resolve));
};
