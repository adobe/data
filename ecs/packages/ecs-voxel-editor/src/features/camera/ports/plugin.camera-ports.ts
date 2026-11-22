// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin, World } from "@adobe/ecs";
import { surface } from "../../../ports/index.js";
import { frameWorld, orbitCamera, panCamera, resetView, turnCamera, viewCamera, zoomCamera } from "../model/index.js";

/**
 * Blender's view navigation on the scene's canvas: the middle button, or Alt and the left, drags to orbit, with Shift to
 * pan and with Ctrl to zoom; a mouse's wheel zooms; a trackpad's two fingers orbit, with Shift pan and with Ctrl zoom,
 * and pinching zooms. The keys held are read at each move, so pressing one mid-drag changes what it does. The
 * numpad's 1, 3 and 7 turn to the front, right and top views, with Ctrl to the back, left and bottom; 2, 4, 6 and 8
 * orbit by steps; W and S pitch the view and A and D turn it about the world's up, keeping it level, smoothly while
 * held; N returns to the starting view; Home and the numpad's period frame the world.
 */
export const cameraPorts: Plugin<typeof surface> = {
    systems: [],
    connect: (world, { [surface]: canvas }) => {
        let dragging: number | null = null;
        const down = (event: PointerEvent): void => {
            if (event.button !== 1 && !(event.button === 0 && event.altKey)) return;
            event.preventDefault();
            dragging = event.pointerId;
            canvas.setPointerCapture(event.pointerId);
        };
        const move = (event: PointerEvent): void => {
            if (event.pointerId !== dragging) return;
            navigate(world, event.movementX, event.movementY, canvas.clientHeight, event.shiftKey ? "pan" : event.ctrlKey ? "zoom" : "orbit");
        };
        const up = (event: PointerEvent): void => {
            if (event.pointerId !== dragging) return;
            dragging = null;
            canvas.releasePointerCapture(event.pointerId);
        };
        const wheel = (event: WheelEvent): void => {
            event.preventDefault();
            const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
            const [dx, dy] = [event.deltaX * scale, event.deltaY * scale];
            // A pinch arrives as a wheel with Ctrl, and zooms, as Ctrl and two fingers do.
            if (event.ctrlKey) navigate(world, 0, dy * 2, canvas.clientHeight, "zoom");
            else if (fromMouseWheel(event)) navigate(world, 0, dy, canvas.clientHeight, "zoom");
            // Two fingers move the view as a drag with them would: scrolling reports the content's way, the fingers' opposite.
            else navigate(world, -dx, -dy, canvas.clientHeight, event.shiftKey ? "pan" : "orbit");
        };
        // The WASD keys held, each turning the view at `turnRate` each frame until it's released.
        const held = new Set<string>();
        let frame: number | null = null;
        let last = 0;
        const turn = (now: number): void => {
            const seconds = Math.min((now - last) / 1000, 0.1);
            last = now;
            const way = (plus: string, minus: string): number => (held.has(plus) ? 1 : 0) - (held.has(minus) ? 1 : 0);
            const dx = way("KeyD", "KeyA") * turnRate * seconds;
            const dy = way("KeyS", "KeyW") * turnRate * seconds;
            if (dx !== 0 || dy !== 0) void world.run(turnCamera, { dx, dy });
            frame = held.size === 0 ? null : requestAnimationFrame(turn);
        };
        const release = (event: KeyboardEvent): void => {
            held.delete(event.code);
        };
        const releaseAll = (): void => held.clear();
        const key = (event: KeyboardEvent): void => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            if (wasd.has(event.code) && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault();
                held.add(event.code);
                if (frame === null) {
                    last = performance.now();
                    frame = requestAnimationFrame(turn);
                }
                return;
            }
            const back = event.ctrlKey || event.metaKey;
            const step = Math.PI / 12;
            switch (event.code) {
                case "Numpad1": void world.run(viewCamera, { yaw: back ? Math.PI : 0, pitch: 0 }); break;
                case "Numpad3": void world.run(viewCamera, { yaw: back ? -Math.PI / 2 : Math.PI / 2, pitch: 0 }); break;
                case "Numpad7": void world.run(viewCamera, { yaw: 0, pitch: back ? -Math.PI / 2 : Math.PI / 2 }); break;
                case "Numpad4": void world.run(orbitCamera, { dx: -step, dy: 0 }); break;
                case "Numpad6": void world.run(orbitCamera, { dx: step, dy: 0 }); break;
                case "Numpad8": void world.run(orbitCamera, { dx: 0, dy: -step }); break;
                case "Numpad2": void world.run(orbitCamera, { dx: 0, dy: step }); break;
                case "KeyN":
                    if (back || event.altKey) return;
                    void world.run(resetView);
                    break;
                case "Home":
                case "NumpadDecimal": void world.run(frameWorld); break;
                default: return;
            }
            event.preventDefault();
        };
        const menu = (event: MouseEvent): void => event.preventDefault();
        canvas.addEventListener("pointerdown", down);
        canvas.addEventListener("pointermove", move);
        canvas.addEventListener("pointerup", up);
        canvas.addEventListener("pointercancel", up);
        canvas.addEventListener("wheel", wheel, { passive: false });
        canvas.addEventListener("contextmenu", menu);
        document.addEventListener("keydown", key);
        document.addEventListener("keyup", release);
        addEventListener("blur", releaseAll);
        return () => {
            if (frame !== null) cancelAnimationFrame(frame);
            document.removeEventListener("keyup", release);
            removeEventListener("blur", releaseAll);
            canvas.removeEventListener("pointerdown", down);
            canvas.removeEventListener("pointermove", move);
            canvas.removeEventListener("pointerup", up);
            canvas.removeEventListener("pointercancel", up);
            canvas.removeEventListener("wheel", wheel);
            canvas.removeEventListener("contextmenu", menu);
            document.removeEventListener("keydown", key);
        };
    },
};

/** The keys turning the view while held. */
const wasd: ReadonlySet<string> = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);

/** How fast held WASD keys turn the view, in radians a second. */
const turnRate = Math.PI / 2;

/** Runs the navigation a pointer moved `dx` and `dy` pixels, across a view `height` pixels tall, asks for. */
const navigate = (world: World, dx: number, dy: number, height: number, kind: "orbit" | "pan" | "zoom"): void => {
    const tall = Math.max(height, 1);
    if (kind === "orbit") void world.run(orbitCamera, { dx: dx / tall * Math.PI, dy: dy / tall * Math.PI });
    else if (kind === "pan") void world.run(panCamera, { dx: dx / tall, dy: dy / tall });
    else void world.run(zoomCamera, { factor: Math.exp(dy / tall * 2) });
};

/**
 * Whether a wheel event is a mouse's wheel turning, rather than a trackpad's two fingers: a wheel steps by lines, or,
 * in Chromium and Safari, by notches of 120 in the legacy `wheelDeltaY`, straight up or down; fingers move by pixels.
 */
const fromMouseWheel = (event: WheelEvent): boolean => {
    if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return true;
    const legacy: unknown = Reflect.get(event, "wheelDeltaY");
    return event.deltaX === 0 && typeof legacy === "number" && legacy !== 0 && legacy % 120 === 0;
};
