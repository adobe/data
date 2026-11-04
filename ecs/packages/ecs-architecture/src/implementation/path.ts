// © 2026 Adobe. MIT License. See /LICENSE for details.
// Posix paths relative to a source folder, as the checks name files, in any runtime.

/** A path's segments with `.` and `..` resolved; a `..` above the start is kept. */
const segmentsOf = (path: string): string[] => {
    const segments: string[] = [];
    for (const segment of path.split('/')) {
        if (segment === '' || segment === '.') continue;
        if (segment === '..' && segments.length > 0 && segments[segments.length - 1] !== '..') segments.pop();
        else segments.push(segment);
    }
    return segments;
};

export const normalize = (path: string): string => segmentsOf(path).join('/') || '.';

export const join = (...paths: readonly string[]): string => normalize(paths.join('/'));

/** The folder holding a path: `.` for a name alone. */
export const dirname = (path: string): string => {
    const trimmed = path.replace(/(?<=.)\/+$/, '');
    const at = trimmed.lastIndexOf('/');
    return at < 0 ? '.' : at === 0 ? '/' : trimmed.slice(0, at);
};

export const basename = (path: string): string => {
    const trimmed = path.replace(/(?<=.)\/+$/, '');
    return trimmed.slice(trimmed.lastIndexOf('/') + 1);
};

/** The path from folder `from` to `to`. */
export const relative = (from: string, to: string): string => {
    const a = segmentsOf(from);
    const b = segmentsOf(to);
    let shared = 0;
    while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
    return [...a.slice(shared).map(() => '..'), ...b.slice(shared)].join('/');
};
