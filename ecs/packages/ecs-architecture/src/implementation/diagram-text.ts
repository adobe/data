// © 2026 Adobe. MIT License. See /LICENSE for details.

export const start = '<!-- architecture:start -->';
export const end = '<!-- architecture:end -->';
/** The most a node's description may say, so a diagram reads at a glance. */
export const maxDescription = 64;
/** A layer with at least this many parts gets a diagram of them in its README. */
export const minPartsForDiagram = 3;

/** The first sentence of the first paragraph under a document's heading, as plain text. */
export const summaryOf = (text: string): string => {
    const lines = text.split('\n');
    let at = lines.findIndex(line => line.startsWith('# ')) + 1;
    while (at < lines.length && ((lines[at] ?? '').trim() === '' || (lines[at] ?? '').startsWith('>'))) at++;
    const paragraph: string[] = [];
    for (let line = lines[at]; line !== undefined && line.trim() !== '' && !line.startsWith('<!--'); line = lines[++at]) paragraph.push(line.trim());
    const sentence = paragraph.join(' ').split(/(?<=[.!?])\s/)[0] ?? '';
    return sentence.replace(/`/g, '').replace(/[.!?]$/, '');
};
/** The description a document gives itself: its first `> ` line. */
export const describedBy = (text: string): string | undefined => {
    const line = text.split('\n').find(each => each.startsWith('> '));
    return line?.slice(2).replace(/`/g, '').replace(/[.!?]$/, '');
};

export const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A node's id, distinct for each list of names: each character but a letter or digit, `_` too, written as its code. */
export const idOf = (...names: string[]): string => names.map(name => name.replace(/[^A-Za-z0-9]/g, character => `_${character.charCodeAt(0).toString(16)}_`)).join('__');
export const label = (name: string, description: string): string => `"<b>${escape(name)}</b>${description ? `<br/><i>${escape(description)}</i>` : ''}"`;
export const table = (rows: readonly string[]): string => `| | What |\n|---|---|\n${rows.join('\n')}`;
export const unique = (edges: readonly [string, string][]): [string, string][] => [...new Map(edges.map(edge => [edge.join('>'), edge])).values()];

/** The edges no longer path between the same nodes implies. */
export const reduce = (edges: readonly [string, string][]): [string, string][] => {
    const next = new Map<string, Set<string>>();
    for (const [a, b] of edges) {
        let set = next.get(a);
        if (set === undefined) next.set(a, set = new Set());
        set.add(b);
    }
    const reaches = (from: string, to: string): boolean => {
        const seen = new Set<string>();
        const stack = [from];
        for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
            for (const child of next.get(node) ?? []) {
                if (node === from && child === to) continue;
                if (child === to) return true;
                if (!seen.has(child)) {
                    seen.add(child);
                    stack.push(child);
                }
            }
        }
        return false;
    };
    return edges.filter(([a, b]) => !reaches(a, b));
};

export const init = '%%{init: {"flowchart": {"nodeSpacing": 30, "rankSpacing": 70}}}%%';
/** The standard's layers' colors; a layer of another name is drawn plain. */
const colors: { readonly [layer: string]: string } = {
    elements: 'fill:#efe6ff,stroke:#7c5cbf,color:#222',
    model: 'fill:#dcebff,stroke:#3b7ddd,color:#222',
    ports: 'fill:#ffe9cc,stroke:#d9822b,color:#222',
    view: 'fill:#dff5e1,stroke:#3a9a4b,color:#222',
};
export const classesOf = (layers: readonly string[]): string => [
    '  classDef ground fill:none,stroke:none;',
    ...layers.map(layer => `  classDef ${idOf(layer)} ${colors[layer] ?? 'fill:#f3f3f3,stroke:#777,color:#222'};`),
    '  classDef app fill:#fff3b0,stroke:#b59b00,color:#222;',
    '  classDef feature fill:#f3f3f3,stroke:#777,color:#222;',
].join('\n');

/** The text without a generated block, and the blank line before it. */
export const removeBlock = (text: string): string => {
    const a = text.indexOf(start);
    const b = text.indexOf(end);
    return a !== -1 && b > a ? `${text.slice(0, a).replace(/\n+$/, '\n')}${text.slice(b + end.length).replace(/^\n/, '')}` : text;
};

export const replaceBlock = (text: string, block: string): string => {
    const a = text.indexOf(start);
    const b = text.indexOf(end);
    if (a !== -1 && b > a) return `${text.slice(0, a)}${start}\n${block}\n${text.slice(b)}`;
    return `${text.replace(/\n*$/, '\n')}\n${start}\n${block}\n${end}\n`;
};
