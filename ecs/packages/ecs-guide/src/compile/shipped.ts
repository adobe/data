// © 2026 Adobe. MIT License. See /LICENSE for details.

/** A pattern of a package.json's `files`, as a regular expression over a path in the package. */
const patternOf = (pattern: string): RegExp => {
    const source = pattern.replace(/^\.?\//, "").replace(/\/$/, "").split(/(\*\*\/|\*\*|\*)/).map(part =>
        part === "**/" ? "(?:.*/)?" : part === "**" ? ".*" : part === "*" ? "[^/]*" : part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("");
    // A path matches a pattern naming it, or a folder it's in.
    return new RegExp(`^${source}(?:/.*)?$`);
};

/**
 * Whether a package ships a file, by its path in the package, as its package.json's `files` say: the last pattern
 * matching it decides, `!` excluding what it matches. Patterns read as npm reads them, for the ones a package uses:
 * paths and folders, with `*` and `**`.
 */
export const shippedBy = (files: readonly string[]): ((path: string) => boolean) => {
    const patterns = files.map(pattern => ({ exclude: pattern.startsWith("!"), match: patternOf(pattern.replace(/^!/, "")) }));
    return path => patterns.reduce((shipped, { exclude, match }) => match.test(path) ? !exclude : shipped, false);
};

/** What a package.json's `files` list, or none when it has no such list. */
export const filesOf = (manifest: string): readonly string[] => {
    const json: unknown = JSON.parse(manifest);
    const files: unknown = typeof json === "object" && json !== null ? Reflect.get(json, "files") : undefined;
    return Array.isArray(files) ? files.filter(item => typeof item === "string") : [];
};
