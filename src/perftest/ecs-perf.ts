// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Column, createECS } from "../old-ecs/index.js";
import { F32, True, U32 } from "../schema/index.js";
import { PerformanceTest } from "./perf-test.js";
import * as assembly from "../../dist/assembly/index.js";
import { createWasmMemoryAllocator } from "../cache/memory-allocator.js";
import { TypedArray } from "../internal/typed-array/index.js";

// const COUNT = 1_000_000;
// const SIZEOF_F32 = 4;
// const SIZEOF_BOOLEAN = 1;
// const OBJECT_OVERHEAD = 16;
// //  Expected 50 Mb
// const EXPECTED_MEMORY = (8 * SIZEOF_F32 + 2 * SIZEOF_BOOLEAN + OBJECT_OVERHEAD) * COUNT;

function createECSWithParticles(count: number, batch = true) {
  const ecs = createECS({
    allocator: createWasmMemoryAllocator(assembly.memory),
  })
    .withComponents({
      color: U32.schema,
      enabled: True.schema,
      mass: F32.schema,
      positionX: F32.schema,
      positionY: F32.schema,
      positionZ: F32.schema,
      velocityX: F32.schema,
      velocityY: F32.schema,
      velocityZ: F32.schema,
      visible: True.schema,
    })
    .withArchetypes({
      VisibleEnabled: [
        "id",
        "color",
        "enabled",
        "mass",
        "positionX",
        "positionY",
        "positionZ",
        "velocityX",
        "velocityY",
        "velocityZ",
        "visible",
      ],
      InvisibleEnabled: [
        "id",
        "color",
        "enabled",
        "mass",
        "positionX",
        "positionY",
        "positionZ",
        "velocityX",
        "velocityY",
        "velocityZ",
      ],
      VisibleDisabled: [
        "id",
        "color",
        "mass",
        "positionX",
        "positionY",
        "positionZ",
        "velocityX",
        "velocityY",
        "velocityZ",
        "visible",
      ],
      InvisibleDisabled: [
        "id",
        "color",
        "mass",
        "positionX",
        "positionY",
        "positionZ",
        "velocityX",
        "velocityY",
        "velocityZ",
      ]
    });

  const particle_archetypes = [
    ecs.archetypes.VisibleEnabled,
    ecs.archetypes.VisibleDisabled,
    ecs.archetypes.InvisibleEnabled,
    ecs.archetypes.InvisibleDisabled,
  ] as const;

  if (batch) {

    const particle_count_per_table = Math.ceil(count / 4);
    const particle_tables = particle_archetypes.map(archetype => ecs.createBatch(archetype, particle_count_per_table));

    for (let tableIndex = 0; tableIndex < particle_tables.length; tableIndex++) {
      const table = particle_tables[tableIndex];
      const positionX = table.columns.positionX.native as TypedArray;
      const positionY = table.columns.positionY.native as TypedArray;
      const positionZ = table.columns.positionZ.native as TypedArray;
      const velocityX = table.columns.velocityX.native as TypedArray;
      const velocityY = table.columns.velocityY.native as TypedArray;
      const velocityZ = table.columns.velocityZ.native as TypedArray;
      const color = table.columns.color.native!;
      const mass = table.columns.mass.native!;
      for (let k = 0; k < particle_count_per_table; k++) {
        const i = tableIndex + k * 4;
        color[k] = 0xff00ff;
        mass[k] = 10;
        positionX[k] = i + 1;
        positionY[k] = i + 1;
        positionZ[k] = i + 1;
        velocityX[k] = -i;
        velocityY[k] = -i;
        velocityZ[k] = -i;
      }
    }
  }
  else {
    for (let i = 0; i < count; i++) {
      ecs.createEntity(particle_archetypes[i % 4], {
        color: 0xff00ff,
        mass: 10,
        positionX: i + 1,
        positionY: i + 1,
        positionZ: i + 1,
        velocityX: -i,
        velocityY: -i,
        velocityZ: -i,
        visible: (i >> 0) % 2 === 0 ? true : false,
        enabled: (i >> 1) % 2 === 0 ? true : false,
      } as any);
    }
  }

  return ecs;
}

const create = (batch: boolean) => {
  let count = 0;
  const setup = async (n: number) => {
    count = n;
  };
  const run = () => {
    createECSWithParticles(count, batch);
  };
  const cleanup = async () => { };
  return { setup, run: run, cleanup, type: "create" } satisfies PerformanceTest;
};

function addManagedArrays(
  a: Column<number>,
  b: Column<number>,
  rows: number,
  addWasm: typeof assembly.addF32Arrays
) {
  const aptr = (a.native as unknown as Float32Array).byteOffset.valueOf();
  const bptr = (b.native as unknown as Float32Array).byteOffset.valueOf();
  addWasm(aptr, bptr, rows);
}

function createMoveParticlesPerformanceTest(options: {
  mode: "column" | "native" | typeof assembly.addF32Arrays;
}) {
  let ecs: ReturnType<typeof createECSWithParticles>;
  const setup = async (n: number) => {
    ecs = createECSWithParticles(n);
  };
  const run = () => {
    let total = 0;
    const addWasm = typeof options.mode === "function" ? options.mode : null;
    for (const table of ecs.getTables(ecs.archetypes.VisibleEnabled, {
      mode: "write",
    })) {
      const { rows, columns } = table;
      total += rows;
      if (addWasm) {
        addManagedArrays(columns.positionX, columns.velocityX, rows, addWasm);
        addManagedArrays(columns.positionY, columns.velocityY, rows, addWasm);
        addManagedArrays(columns.positionZ, columns.velocityZ, rows, addWasm);
      } else if (options.mode === "column") {
        const {
          positionX,
          positionY,
          positionZ,
          velocityX,
          velocityY,
          velocityZ,
        } = columns;
        for (let i = 0; i < rows; i++) {
          positionX.set(i, positionX.get(i) + velocityX.get(i));
          positionY.set(i, positionY.get(i) + velocityY.get(i));
          positionZ.set(i, positionZ.get(i) + velocityZ.get(i));
        }
      } else if (options.mode === "native") {
        const positionX = columns.positionX.native!;
        const positionY = columns.positionY.native!;
        const positionZ = columns.positionZ.native!;
        const velocityX = columns.velocityX.native!;
        const velocityY = columns.velocityY.native!;
        const velocityZ = columns.velocityZ.native!;
        for (let i = 0; i < rows; i++) {
          positionX[i] += velocityX[i];
          positionY[i] += velocityY[i];
          positionZ[i] += velocityZ[i];
        }
      }
    }
  };
  const getVisibleEnabledPositions = () => {
    const values: number[] = [];
    for (const table of ecs.getTables(ecs.archetypes.VisibleEnabled, {
      mode: "read",
    })) {
      const { rows, columns } = table;
      const { positionX, positionY, positionZ } = columns;
      for (let i = 0; i < rows; i++) {
        values.push(positionX.get(i), positionY.get(i), positionZ.get(i));
      }
    }
    return values;
  }

  const cleanup = async () => { };
  return { setup, run: run, cleanup, getVisibleEnabledPositions, type: "move" } satisfies PerformanceTest;
}

export const ec2s = {
  create: create(false),
  create_batch: create(true),
  move_column: createMoveParticlesPerformanceTest({ mode: "column" }),
  move_native: createMoveParticlesPerformanceTest({ mode: "native" }),
  move_wasm: createMoveParticlesPerformanceTest({ mode: assembly.addF32Arrays }),
  move_wasm_simd4: createMoveParticlesPerformanceTest({ mode: assembly.addF32ArraysSimd4 }),
  move_wasm_simd4_unrolled: createMoveParticlesPerformanceTest({ mode: assembly.addF32ArraysSimd4Unrolled }),
};
