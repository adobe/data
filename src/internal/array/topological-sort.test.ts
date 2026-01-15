// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { topologicalSort, type Edge } from "./topological-sort.js";

describe("topologicalSort", () => {
    it("should sort string nodes in dependency order", () => {
        const nodes = ["a", "b", "c"];
        const edges: Edge<string>[] = [["a", "b"], ["b", "c"]]; // a → b → c
        
        const result = topologicalSort(nodes, edges);
        
        expect(result).toEqual(["a", "b", "c"]);
    });

    it("should handle nodes with no dependencies", () => {
        const nodes = ["x", "y", "z"];
        const edges: Edge<string>[] = [];
        
        const result = topologicalSort(nodes, edges);
        
        expect(result).toHaveLength(3);
        expect(result).toContain("x");
        expect(result).toContain("y");
        expect(result).toContain("z");
    });

    it("should work with number nodes", () => {
        const nodes = [1, 2, 3, 4];
        const edges: Edge<number>[] = [[1, 2], [2, 3], [1, 4]]; // 1 → 2 → 3, 1 → 4
        
        const result = topologicalSort(nodes, edges);
        
        // Verify ordering constraints
        expect(result.indexOf(1)).toBeLessThan(result.indexOf(2));
        expect(result.indexOf(2)).toBeLessThan(result.indexOf(3));
        expect(result.indexOf(1)).toBeLessThan(result.indexOf(4));
    });

    it("should work with object nodes", () => {
        const nodeA = { name: "a" };
        const nodeB = { name: "b" };
        const nodeC = { name: "c" };
        const nodes = [nodeA, nodeB, nodeC];
        const edges: Edge<typeof nodeA>[] = [[nodeA, nodeB], [nodeB, nodeC]];
        
        const result = topologicalSort(nodes, edges);
        
        expect(result).toEqual([nodeA, nodeB, nodeC]);
    });

    it("should handle complex dependency graph", () => {
        const nodes = ["input", "physics", "render", "audio"];
        const edges: Edge<string>[] = [
            ["input", "physics"],   // input → physics
            ["physics", "render"],  // physics → render
            ["input", "audio"],     // input → audio
        ];
        
        const result = topologicalSort(nodes, edges);
        
        // Verify ordering constraints
        expect(result.indexOf("input")).toBeLessThan(result.indexOf("physics"));
        expect(result.indexOf("physics")).toBeLessThan(result.indexOf("render"));
        expect(result.indexOf("input")).toBeLessThan(result.indexOf("audio"));
    });

    it("should ignore edges for nodes not in the list", () => {
        const nodes = ["a", "b"];
        const edges: Edge<string>[] = [["a", "b"], ["b", "c"], ["c", "d"]]; // c,d not in nodes
        
        const result = topologicalSort(nodes, edges);
        
        expect(result).toEqual(["a", "b"]);
    });

    it("should detect circular dependencies", () => {
        const nodes = ["a", "b", "c"];
        const edges: Edge<string>[] = [
            ["a", "b"],
            ["b", "c"],
            ["c", "a"], // creates cycle
        ];
        
        expect(() => topologicalSort(nodes, edges))
            .toThrow("Circular dependency detected involving node:");
    });

    it("should handle single node", () => {
        const nodes = ["single"];
        const edges: Edge<string>[] = [];
        
        const result = topologicalSort(nodes, edges);
        
        expect(result).toEqual(["single"]);
    });

    it("should handle empty input", () => {
        const nodes: string[] = [];
        const edges: Edge<string>[] = [];
        
        const result = topologicalSort(nodes, edges);
        
        expect(result).toEqual([]);
    });
});
