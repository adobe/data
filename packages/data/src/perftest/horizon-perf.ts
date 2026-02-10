// © 2026 Adobe. MIT License. See /LICENSE for details.
import { shuffleArray } from "./helper-functions.js";
import { PerformanceTest } from "./perf-test.js";

function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
// uuid-imports.d.ts
async function createParticles(count: number) {
  const particlesIds: string[] = [];
  const components: Map<string, Map<string, any>> = new Map();
  const setComponent = (name: string, key: string, value: any) => {
    let component = components.get(name);
    if (!component) {
      component = new Map();
      components.set(name, component);
    }
    component.set(key, value);
  };
  const getComponent = (name: string, key: string) => {
    const component = components.get(name);
    if (!component) {
      return undefined;
    }
    return component.get(key);
  };
  const particles: any[] = [];
  for (let i = 0; i < count; i++) {
    const entity = uuidv4();
    particlesIds.push(entity);
    setComponent(entity, "color", { value: 0xff00ff });
    setComponent(entity, "mass", { value: 10 });
    setComponent(entity, "position", { x: i + 1, y: i + 1, z: i + 1 });
    setComponent(entity, "velocity", { x: - i, y: - i, z: - i });
    if ((i >> 0) % 2 === 0) {
      setComponent(entity, "visible", true);
    }
    if ((i >> 1) % 2 === 0) {
      setComponent(entity, "enabled", true);
    }
  }
  const enabledVisibleParticles = particlesIds.filter((id, i) => {
    return getComponent(id, "enabled") && getComponent(id, "visible");
  });

  return {
    particles,
    components,
    setComponent,
    getComponent,
    enabledVisibleParticles,
  };
}

const create = (() => {
  let count = 0;
  const setup = async (n: number) => {
    count = n;
  };
  const run = () => {
    createParticles(count);
  };
  const cleanup = async () => {};
  return { setup, run: run, cleanup, type: "create" } satisfies PerformanceTest;
})();

function createMoveParticlesPerformanceTest(options: { shuffle: boolean }) {
  let ecs: any;
  const setup = async (n: number) => {
    ecs = await createParticles(n);
    if (options.shuffle) {
      shuffleArray(ecs.particles);
    }
  };
  const run = () => {
    for (let i = 0; i < ecs.enabledVisibleParticles.length; i++) {
      const p = ecs.enabledVisibleParticles[i];
      const position = ecs.getComponent(p, "position");
      const velocity = ecs.getComponent(p, "velocity");
      const newPosition = { 
        x: position.x + velocity.x,
        y: position.y + velocity.y,
        z: position.z + velocity.z,
      };
      ecs.setComponent(p, "position", newPosition);
    }
  };
  const getVisibleEnabledPositions = () => {
    const values: number[] = [];
    for (let i = 0; i < ecs.enabledVisibleParticles.length; i++) {
      const p = ecs.enabledVisibleParticles[i];
      const position = ecs.getComponent(p, "position");
      values.push(position.x, position.y, position.z);
    }
    return values;
  }
  const cleanup = async () => {};
  return { setup, run: run, cleanup, getVisibleEnabledPositions, type: "move" } satisfies PerformanceTest;
}

const move_best = createMoveParticlesPerformanceTest({ shuffle: false });
const move_worst = createMoveParticlesPerformanceTest({ shuffle: true });

export const horizon = {
  create,
  move_best,
  move_worst,
};
