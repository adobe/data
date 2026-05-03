// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Validate that a relative path is safe to use within a backend root.
 * Rejects:
 *
 *   - empty paths
 *   - absolute paths (leading '/' or drive letter)
 *   - paths containing '..' segments (path traversal)
 *   - null bytes
 *   - backslashes (we normalize on '/')
 *
 * Defense-in-depth against the path-traversal class of vulnerabilities.
 * See .cursor/rules/security-global/security-global-pathtraversal-prevention.mdc.
 */
export const validateRelPath = (relPath: string): void => {
    if (typeof relPath !== "string" || relPath.length === 0) {
        throw new Error("Path must be a non-empty string");
    }
    if (relPath.includes("\0")) {
        throw new Error(`Path contains a null byte: ${JSON.stringify(relPath)}`);
    }
    if (relPath.includes("\\")) {
        throw new Error(`Path contains a backslash; use '/' as the separator: ${JSON.stringify(relPath)}`);
    }
    if (relPath.startsWith("/")) {
        throw new Error(`Path must be relative (no leading '/'): ${JSON.stringify(relPath)}`);
    }
    // Reject Windows drive letters explicitly even though we never use
    // them — consistent rejection regardless of host OS.
    if (/^[A-Za-z]:/.test(relPath)) {
        throw new Error(`Path looks like an absolute Windows path: ${JSON.stringify(relPath)}`);
    }
    const segments = relPath.split("/");
    for (const segment of segments) {
        if (segment === "" || segment === ".") {
            // Tolerate trailing slash and self-references; they reduce to nothing.
            continue;
        }
        if (segment === "..") {
            throw new Error(`Path contains '..' segment (traversal): ${JSON.stringify(relPath)}`);
        }
    }
};
