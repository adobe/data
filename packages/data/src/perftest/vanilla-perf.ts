// © 2026 Adobe. MIT License. See /LICENSE for details.
import { shuffleArray } from "./helper-functions.js";
import { PerformanceTest } from "./perf-test.js";

function createParticlesJS(n: number) {
  const particles: any[] = [];
  for (let i = 0; i < n; i++) {
    const particle: any = {
      color: 0xff00ff,
      mass: 10,
      positionX: i + 1,
      positionY: i + 1,
      positionZ: i + 1,
      velocityX: -i,
      velocityY: -i,
      velocityZ: -i,
    };
    if ((i >> 0) % 2 === 0) {
      particle.visible = true;
    }
    if ((i >> 1) % 2 === 0) {
      particle.enabled = true;
    }
    particles.push(particle);
  }
  return particles;
}

const create = (() => {
  let count = 0;
  const setup = async (n: number) => {
    count = n;
  };
  const run = () => {
    createParticlesJS(count);
  };
  const cleanup = async () => {};
  return { setup, run: run, cleanup, type: "create" } satisfies PerformanceTest;
})();

function createMoveParticlesPerformanceTest(options: {
  shuffle: boolean;
  immutable: boolean;
}) {
  let particles: any[] = [];
  const setup = async (n: number) => {
    particles = createParticlesJS(n);
    if (options.shuffle) {
      shuffleArray(particles);
    }
  };
  const run = () => {
    if (options.immutable) {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.visible && p.enabled) {
          particles[i] = {
            ...p,
            positionX: p.positionX + p.velocityX,
            positionY: p.positionY + p.velocityY,
            positionZ: p.positionZ + p.velocityZ,
          };
        }
      }
    } else {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.visible && p.enabled) {
          p.positionX += p.velocityX;
          p.positionY += p.velocityY;
          p.positionZ += p.velocityZ;
        }
      }
    }
  };
  const getVisibleEnabledPositions = () => {
    const values: number[] = [];
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.visible && p.enabled) {
        values.push(p.positionX, p.positionY, p.positionZ);
      }
    }
    return values;
  }
  const cleanup = async () => {};
  return { setup, run: run, cleanup, getVisibleEnabledPositions: options.shuffle ? undefined : getVisibleEnabledPositions, type: "move" } satisfies PerformanceTest;
}

const move_best = createMoveParticlesPerformanceTest({
  shuffle: false,
  immutable: false,
});
const move_worst = createMoveParticlesPerformanceTest({
  shuffle: true,
  immutable: false,
});
const move_best_immutable = createMoveParticlesPerformanceTest({
  shuffle: false,
  immutable: true,
});
const move_worst_immutable = createMoveParticlesPerformanceTest({
  shuffle: true,
  immutable: true,
});

export const vanilla_js = {
  create,
  move_best,
  move_worst,
};

export const immutable_js = {
  move_best: move_best_immutable,
  move_worst: move_worst_immutable,
};
