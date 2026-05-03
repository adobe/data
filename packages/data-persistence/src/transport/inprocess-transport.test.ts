// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { createMemoryBackend } from "../backend/memory-backend.js";
import { createInprocessTransport } from "./inprocess-transport.js";

describe("createInprocessTransport", () => {
    it("routes writeColumnSlice to the backend", async () => {
        const backend = createMemoryBackend();
        const transport = createInprocessTransport(backend);
        try {
            const bytes = new Uint8Array([1, 2, 3, 4]).buffer.slice(0);
            await transport.request({
                id: 1,
                kind: "writeColumnSlice",
                archetypeId: 7,
                component: "position",
                rowOffset: 0,
                bytes,
            });
            const file = await backend.open("archetypes/7/position.bin");
            const read = await file.readAt(0, 4);
            expect(Array.from(read)).toEqual([1, 2, 3, 4]);
            await file.close();
        } finally {
            await transport.close();
        }
    });

    it("appends to the journal and returns the new size", async () => {
        const backend = createMemoryBackend();
        const transport = createInprocessTransport(backend);
        try {
            const a = new Uint8Array([1, 2, 3]).buffer.slice(0);
            const b = new Uint8Array([4, 5]).buffer.slice(0);
            const sizeAfterA = await transport.request<number>({ id: 1, kind: "appendJournal", bytes: a });
            const sizeAfterB = await transport.request<number>({ id: 2, kind: "appendJournal", bytes: b });
            expect(sizeAfterA).toBe(3);
            expect(sizeAfterB).toBe(5);
        } finally {
            await transport.close();
        }
    });

    it("delivers ack messages for fire-and-forget sends", async () => {
        const backend = createMemoryBackend();
        const transport = createInprocessTransport(backend);
        try {
            const acks: { id: number; error?: string }[] = [];
            const off = transport.onMessage(msg => {
                if (msg.kind === "ack") acks.push({ id: msg.id, error: msg.error });
            });
            transport.send({ id: 42, kind: "writeEntityLocation", entity: 1, archetypeId: 5, rowIndex: 3 });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(acks).toEqual([{ id: 42, error: undefined }]);
            off();
        } finally {
            await transport.close();
        }
    });

    it("delivers error acks when the router rejects", async () => {
        const backend = createMemoryBackend();
        const transport = createInprocessTransport(backend);
        try {
            const acks: { id: number; error?: string }[] = [];
            transport.onMessage(msg => {
                if (msg.kind === "ack") acks.push({ id: msg.id, error: msg.error });
            });
            // writeEntityLocation rejects negative ("ephemeral")
            // entities by design. Use it as the trigger to verify the
            // router surfaces the rejection as an ack message with
            // `error` populated rather than an unhandled rejection.
            transport.send({
                id: 7,
                kind: "writeEntityLocation",
                entity: -1,
                archetypeId: 0,
                rowIndex: 0,
            });
            // Wait one microtask + one macrotask to let the async
            // dispatch settle.
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(acks.length).toBe(1);
            expect(acks[0]!.id).toBe(7);
            expect(acks[0]!.error).toBeDefined();
        } finally {
            await transport.close();
        }
    });

    it("rejects sends after close", async () => {
        const backend = createMemoryBackend();
        const transport = createInprocessTransport(backend);
        await transport.close();
        expect(() => transport.send({ id: 1, kind: "writeEntityLocation", entity: 1, archetypeId: 0, rowIndex: 0 })).toThrow();
    });
});
