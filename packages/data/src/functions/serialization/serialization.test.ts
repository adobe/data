// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from 'vitest';
import { serialize, deserialize } from './serialize.js';
import { createTypedBuffer } from '../../typed-buffer/create-typed-buffer.js';
import { equals } from '../../equals.js';
import { createTable } from '../../table/create-table.js';
import { addRow } from '../../table/add-row.js';
import { createStructBuffer } from '../../typed-buffer/create-struct-buffer.js';
import type { TypedBuffer } from '../../typed-buffer/typed-buffer.js';


describe('serialize/deserialize', () => {
  it('round-trips objects with typed arrays', () => {
    const original = {
      a: 1,
      b: new Int32Array([1, 2, 3]),
      nested: {
        c: 3,
        d: new Uint32Array([4, 5]),
      },
      e: new Float32Array([1.5, 2.5, 3.5]),
      d: [new Uint32Array([1])],
      f: new Float64Array([5.5, 6.5, 7.5]),
    };
    const payload = serialize(original);
    expect(payload.json).toBeTypeOf('string');
    expect(payload.binary).toBeInstanceOf(Array);
    const roundTrip = deserialize<typeof original>(payload);
    expect(roundTrip).toEqual(original);
  });
  it('round-trips typed buffers', () => {
    const original = {
      a: createTypedBuffer({ type: "number", precision: 1 }, [3, 2, 1]),
      b: createTypedBuffer({ const: true }, 2),
      c: createTypedBuffer({ type: "object", properties: { x: { type: "number", precision: 1 }, y: { type: "number", precision: 1 } }, required: ["x", "y"], additionalProperties: false }, [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ]),
      d: createTypedBuffer({ type: "object", properties: { name: { type: "string" }, age: { type: "integer" } }, required: ["name", "age"], additionalProperties: false }, [
        { name: "John", age: 30 },
        { name: "Jane", age: 25 },
      ]),
      flags: createTypedBuffer({ type: "boolean" }, [true, false, true]),
    };
    // console.log(original);
    const payload = serialize(original);
    const roundTrip = deserialize<typeof original>(payload);
    expect(equals(roundTrip, original)).toBe(true);
  });
  // round tripping will not work with array-buffer because values are undefined originally and null on round trip
  // it('round-trips typed-buffers with strings', () => {
  //   const original = createTypedBuffer({ type: "string" });
  //   original.set(0, "Hello");
  //   original.set(1, "World");
  //   original.capacity = 4;
  //   const payload = serialize(original);
  //   const roundTrip = deserialize<typeof original>(payload);
  // });
  it('round-trips tables', () => {
    const table = createTable({
      id: { type: "integer" },
      age: { type: "integer" },
    });
    addRow(table, { id: 1, age: 30 });
    addRow(table, { id: 2, age: 25 });
    const payload = serialize(table);
    const roundTrip = deserialize<typeof table>(payload);
    expect(equals(roundTrip, table)).toBe(true);
  });

  it('should NOT serialize data for ephemeral number buffers and reset to defaults on deserialize', () => {
    const numberBuffer = createTypedBuffer({
      type: "number",
      precision: 1,
      ephemeral: true,
      default: 42
    }, 3);

    // Set custom values
    numberBuffer.set(0, 100);
    numberBuffer.set(1, 200);
    numberBuffer.set(2, 300);

    // Serialize and deserialize
    const payload = serialize({ numberBuffer });
    const roundTrip = deserialize<{ numberBuffer: typeof numberBuffer }>(payload);

    // Verify capacity is preserved
    expect(roundTrip.numberBuffer.capacity).toBe(3);

    // Verify data has been reset to default values
    expect(roundTrip.numberBuffer.get(0)).toBe(42);
    expect(roundTrip.numberBuffer.get(1)).toBe(42);
    expect(roundTrip.numberBuffer.get(2)).toBe(42);

    // Verify original custom data was NOT preserved
    expect(roundTrip.numberBuffer.get(0)).not.toBe(100);
    expect(roundTrip.numberBuffer.get(1)).not.toBe(200);
    expect(roundTrip.numberBuffer.get(2)).not.toBe(300);
  });

  it('should NOT serialize data for ephemeral array buffers and reset to defaults on deserialize', () => {
    const arrayBuffer = createTypedBuffer({
      type: "array",
      items: { type: "string" },
      ephemeral: true,
      default: ["defaultValue1", "defaultValue2"]
    }, 2);

    // Set custom values
    arrayBuffer.set(0, ["customValue1", "customValue2"]);
    arrayBuffer.set(1, ["customValue3", "customValue4"]);

    // Serialize and deserialize
    const payload = serialize({ arrayBuffer });
    const roundTrip = deserialize<{ arrayBuffer: typeof arrayBuffer }>(payload);

    // Verify capacity is preserved
    expect(roundTrip.arrayBuffer.capacity).toBe(2);

    // Verify data has been reset to default values
    expect(roundTrip.arrayBuffer.get(0)).toEqual(["defaultValue1", "defaultValue2"]);
    expect(roundTrip.arrayBuffer.get(1)).toEqual(["defaultValue1", "defaultValue2"]);

    // Verify original custom data was NOT preserved
    expect(roundTrip.arrayBuffer.get(0)).not.toEqual(["customValue1", "customValue2"]);
    expect(roundTrip.arrayBuffer.get(1)).not.toEqual(["customValue3", "customValue4"]);
  });

  it('should NOT serialize data for ephemeral struct buffers and reset to defaults on deserialize', () => {
    const structBuffer = createStructBuffer({
      type: "object",
      ephemeral: true,
      default: { x: 10, y: 20 },
      properties: {
        x: { type: "number", precision: 1 },
        y: { type: "number", precision: 1 }
      },
      required: ["x", "y"],
      additionalProperties: false
    }, 2);

    // Set custom values
    structBuffer.set(0, { x: 999, y: 888 });
    structBuffer.set(1, { x: 777, y: 666 });

    // Serialize and deserialize
    const payload = serialize({ structBuffer });
    const roundTrip = deserialize<{ structBuffer: typeof structBuffer }>(payload);

    // Verify capacity is preserved
    expect(roundTrip.structBuffer.capacity).toBe(2);

    // Verify data has been reset to default values
    expect(roundTrip.structBuffer.get(0)).toEqual({ x: 10, y: 20 });
    expect(roundTrip.structBuffer.get(1)).toEqual({ x: 10, y: 20 });

    // Verify original custom data was NOT preserved
    expect(roundTrip.structBuffer.get(0)).not.toEqual({ x: 999, y: 888 });
    expect(roundTrip.structBuffer.get(1)).not.toEqual({ x: 777, y: 666 });
  });

  it('round-trips enum typed buffers', () => {
    const schema = { enum: ["landscape", "portrait", "square"] } as const;
    const buf = createTypedBuffer(schema, 3);
    buf.set(0, "landscape");
    buf.set(1, "portrait");
    buf.set(2, "square");

    const payload = serialize({ buf });
    const roundTrip = deserialize<{ buf: TypedBuffer<string> }>(payload);

    expect(roundTrip.buf.type).toBe("enum");
    expect(roundTrip.buf.capacity).toBe(3);
    expect(roundTrip.buf.get(0)).toBe("landscape");
    expect(roundTrip.buf.get(1)).toBe("portrait");
    expect(roundTrip.buf.get(2)).toBe("square");
  });

  it('should deserialize legacy array-serialized enum buffers as enum buffers', () => {
    const schema = { enum: ["landscape", "portrait", "square"] };

    // Simulate the old serialized format: type was "array" with values in a JSON array
    const legacyPayload = {
      json: JSON.stringify({
        buf: {
          codec: "typed-buffer",
          json: {
            type: "array",
            schema,
            capacity: 3,
            array: ["landscape", "portrait", "square"],
          },
          binaryIndex: 0,
          binaryCount: 0,
        },
      }),
      binary: [],
    };

    const roundTrip = deserialize<{ buf: TypedBuffer<string> }>(legacyPayload);

    expect(roundTrip.buf.type).toBe("enum");
    expect(roundTrip.buf.capacity).toBe(3);
    expect(roundTrip.buf.get(0)).toBe("landscape");
    expect(roundTrip.buf.get(1)).toBe("portrait");
    expect(roundTrip.buf.get(2)).toBe("square");
  });

  it('should deserialize enum type with json array fallback when binary is missing', () => {
    const schema = { enum: ["a", "b", "c"] };

    // Simulate a payload where type is "enum" but only a JSON array is present (no binary)
    const fallbackPayload = {
      json: JSON.stringify({
        buf: {
          codec: "typed-buffer",
          json: {
            type: "enum",
            schema,
            capacity: 3,
            array: ["b", "c", "a"],
          },
          binaryIndex: 0,
          binaryCount: 0,
        },
      }),
      binary: [],
    };

    const roundTrip = deserialize<{ buf: TypedBuffer<string> }>(fallbackPayload);

    expect(roundTrip.buf.type).toBe("enum");
    expect(roundTrip.buf.capacity).toBe(3);
    expect(roundTrip.buf.get(0)).toBe("b");
    expect(roundTrip.buf.get(1)).toBe("c");
    expect(roundTrip.buf.get(2)).toBe("a");
  });
}); 