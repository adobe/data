// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { validateRelPath } from "./validate-rel-path.js";

describe("validateRelPath", () => {
    it("accepts simple paths", () => {
        expect(() => validateRelPath("file.bin")).not.toThrow();
        expect(() => validateRelPath("dir/file.bin")).not.toThrow();
        expect(() => validateRelPath("a/b/c/d.bin")).not.toThrow();
    });

    it("accepts trailing slash and self-references", () => {
        expect(() => validateRelPath("dir/")).not.toThrow();
        expect(() => validateRelPath("./file.bin")).not.toThrow();
        expect(() => validateRelPath("dir/./file.bin")).not.toThrow();
    });

    it("rejects empty path", () => {
        expect(() => validateRelPath("")).toThrow(/non-empty/);
    });

    it("rejects absolute paths", () => {
        expect(() => validateRelPath("/etc/passwd")).toThrow(/relative/);
    });

    it("rejects '..' segments", () => {
        expect(() => validateRelPath("..")).toThrow(/traversal/);
        expect(() => validateRelPath("../etc")).toThrow(/traversal/);
        expect(() => validateRelPath("a/../b")).toThrow(/traversal/);
        expect(() => validateRelPath("a/b/..")).toThrow(/traversal/);
    });

    it("rejects null bytes", () => {
        expect(() => validateRelPath("a\0b")).toThrow(/null byte/);
    });

    it("rejects backslashes", () => {
        expect(() => validateRelPath("a\\b")).toThrow(/backslash/);
    });

    it("rejects Windows drive letters", () => {
        expect(() => validateRelPath("C:/foo")).toThrow(/Windows/);
    });
});
