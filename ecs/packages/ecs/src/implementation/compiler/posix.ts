// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * The POSIX path functions the compiler uses, as node's `path.posix` gives them, with no node: so the compiler's core
 * runs in a browser too. `resolve` and `relative` resolve a relative path from `/` where node resolves it from its
 * working directory, which changes neither's result for relative paths that stay below where they start.
 */

const slash = 47;
const dot = 46;

/** A path's segments with `.` and `..` resolved; `..` above the start is kept when `aboveRoot` allows it. */
const normalized = (path: string, aboveRoot: boolean): string => {
    let result = "";
    let lastSegmentLength = 0;
    let lastSlash = -1;
    let dots = 0;
    let code = 0;
    for (let index = 0; index <= path.length; ++index) {
        if (index < path.length) code = path.charCodeAt(index);
        else if (code === slash) break;
        else code = slash;
        if (code === slash) {
            if (lastSlash === index - 1 || dots === 1) {
                // An empty or `.` segment.
            } else if (dots === 2) {
                if (result.length < 2 || lastSegmentLength !== 2 || result.charCodeAt(result.length - 1) !== dot || result.charCodeAt(result.length - 2) !== dot) {
                    if (result.length > 2) {
                        const lastSlashIndex = result.lastIndexOf("/");
                        if (lastSlashIndex === -1) {
                            result = "";
                            lastSegmentLength = 0;
                        } else {
                            result = result.slice(0, lastSlashIndex);
                            lastSegmentLength = result.length - 1 - result.lastIndexOf("/");
                        }
                        lastSlash = index;
                        dots = 0;
                        continue;
                    } else if (result.length !== 0) {
                        result = "";
                        lastSegmentLength = 0;
                        lastSlash = index;
                        dots = 0;
                        continue;
                    }
                }
                if (aboveRoot) {
                    result += result.length > 0 ? "/.." : "..";
                    lastSegmentLength = 2;
                }
            } else {
                result += result.length > 0 ? `/${path.slice(lastSlash + 1, index)}` : path.slice(lastSlash + 1, index);
                lastSegmentLength = index - lastSlash - 1;
            }
            lastSlash = index;
            dots = 0;
        } else if (code === dot && dots !== -1) {
            ++dots;
        } else {
            dots = -1;
        }
    }
    return result;
};

export const isAbsolute = (path: string): boolean => path.length > 0 && path.charCodeAt(0) === slash;

/** The absolute path `paths` resolve to, from right to left, from `/` when none of them is absolute. */
export const resolve = (...paths: readonly string[]): string => {
    let resolved = "";
    let absolute = false;
    for (let index = paths.length - 1; index >= -1 && !absolute; index--) {
        const path = index >= 0 ? paths[index] ?? "" : "/";
        if (path.length === 0) continue;
        resolved = `${path}/${resolved}`;
        absolute = path.charCodeAt(0) === slash;
    }
    resolved = normalized(resolved, !absolute);
    if (absolute) return `/${resolved}`;
    return resolved.length > 0 ? resolved : ".";
};

/** The path from `from` to `to`. */
export const relative = (from: string, to: string): string => {
    if (from === to) return "";
    const source = resolve(from);
    const target = resolve(to);
    if (source === target) return "";
    const sourceLength = source.length - 1;
    const targetLength = target.length - 1;
    const length = sourceLength < targetLength ? sourceLength : targetLength;
    let lastCommonSlash = -1;
    let index = 0;
    for (; index < length; index++) {
        const code = source.charCodeAt(1 + index);
        if (code !== target.charCodeAt(1 + index)) break;
        else if (code === slash) lastCommonSlash = index;
    }
    if (index === length) {
        if (targetLength > length) {
            if (target.charCodeAt(1 + index) === slash) return target.slice(1 + index + 1);
            if (index === 0) return target.slice(1 + index);
        } else if (sourceLength > length) {
            if (source.charCodeAt(1 + index) === slash) lastCommonSlash = index;
            else if (index === 0) lastCommonSlash = 0;
        }
    }
    let up = "";
    for (index = 1 + lastCommonSlash + 1; index <= source.length; ++index) {
        if (index === source.length || source.charCodeAt(index) === slash) up += up.length === 0 ? ".." : "/..";
    }
    return `${up}${target.slice(1 + lastCommonSlash)}`;
};

export const dirname = (path: string): string => {
    if (path.length === 0) return ".";
    const rooted = path.charCodeAt(0) === slash;
    let end = -1;
    let matchedSlash = true;
    for (let index = path.length - 1; index >= 1; --index) {
        if (path.charCodeAt(index) === slash) {
            if (!matchedSlash) {
                end = index;
                break;
            }
        } else {
            matchedSlash = false;
        }
    }
    if (end === -1) return rooted ? "/" : ".";
    if (rooted && end === 1) return "//";
    return path.slice(0, end);
};

export const basename = (path: string): string => {
    let start = 0;
    let end = -1;
    let matchedSlash = true;
    for (let index = path.length - 1; index >= 0; --index) {
        if (path.charCodeAt(index) === slash) {
            if (!matchedSlash) {
                start = index + 1;
                break;
            }
        } else if (end === -1) {
            matchedSlash = false;
            end = index + 1;
        }
    }
    return end === -1 ? "" : path.slice(start, end);
};

export const extname = (path: string): string => {
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    // What comes before the last dot in its segment, read leftward: 0 nothing yet, 1 a dot last, -1 another character last.
    let beforeDot = 0;
    for (let index = path.length - 1; index >= 0; --index) {
        const code = path.charCodeAt(index);
        if (code === slash) {
            if (!matchedSlash) {
                startPart = index + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = index + 1;
        }
        if (code === dot) {
            if (startDot === -1) startDot = index;
            else if (beforeDot !== 1) beforeDot = 1;
        } else if (startDot !== -1) {
            beforeDot = -1;
        }
    }
    if (startDot === -1 || end === -1 || beforeDot === 0 || (beforeDot === 1 && startDot === end - 1 && startDot === startPart + 1)) return "";
    return path.slice(startDot, end);
};
