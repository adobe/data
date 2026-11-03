// © 2026 Adobe. MIT License. See /LICENSE for details.
import { basename, dirname, relative } from './implementation/path.js';
import type { Config } from './config.js';
import { classesOf, describedBy, escape, idOf, init, label, maxDescription, minPartsForDiagram, reduce, removeBlock, replaceBlock, summaryOf, table, unique } from './implementation/diagram-text.js';
import { analyze, isTest, settingsOf } from './implementation/graph.js';


/** What `diagrams` gives: the documents it would change, by path, with their text, and what a person has to fix. */
type Diagrams = { readonly updates: Readonly<Record<string, string>>; readonly problems: readonly string[] };

/**
 * The architecture diagrams of an application's source, drawn from what its code imports: `ARCHITECTURE.md` at the
 * root, the features as a graph; a feature's own `ARCHITECTURE.md` for each with several layers; and a parts diagram
 * in the README of a layer with three parts or more. Each is the text between `<!-- architecture:start -->` and
 * `<!-- architecture:end -->`; the descriptions, at most 64 characters, are written by people. `files` is as `check`
 * takes it.
 */
export const diagrams = (files: Readonly<Record<string, string>>, config?: Config): Diagrams => {
    const settings = settingsOf(config);
    const graph = analyze(files, settings);
    const { components, componentOf, topOf, featureOf, layers } = graph;
    const texts = new Map(graph.files);
    const updates: Record<string, string> = {};
    const problems: string[] = [];
    const set = (path: string, text: string): void => {
        if (texts.get(path) !== text) updates[path] = text;
        texts.set(path, text);
    };

    const features = new Map<string, string[]>();
    for (const component of components) {
        if (componentOf(component) !== undefined || !layers.includes(basename(component)) || dirname(component) === '.') continue;
        const feature = dirname(component);
        let list = features.get(feature);
        if (list === undefined) features.set(feature, list = []);
        list.push(component);
    }
    const layersOf = (feature: string): readonly string[] => features.get(feature) ?? [];
    const docPath = (feature: string): string => `${feature}/ARCHITECTURE.md`;
    const hasDoc = (feature: string): boolean => layersOf(feature).length > 1;
    const linkOf = (feature: string): string => (hasDoc(feature) ? docPath(feature) : `${layersOf(feature)[0] ?? feature}/README.md`);
    const layerSummary = (layer: string): string => summaryOf(texts.get(`${layer}/README.md`) ?? '');
    const checkLength = (what: string, text: string): void => {
        if (text === '') problems.push(`${what} has no description: write a concise first sentence in its README, or a \`> \` line in its ARCHITECTURE.md.`);
        else if (text.length > maxDescription) problems.push(`${what}'s description is ${text.length} characters, more than ${maxDescription}: "${text}". Shorten the first sentence of its README, or the \`> \` line.`);
    };

    // A feature with more than one layer has a document: a title, its description and its diagram.
    const descriptionOf = new Map<string, string>();
    for (const [feature, list] of features) {
        if (list.length > 1) {
            const text = texts.get(docPath(feature)) ?? `# ${feature}\n\n> ${layerSummary(list[0] ?? '')}.\n`;
            descriptionOf.set(feature, describedBy(text) ?? '');
            texts.set(docPath(feature), text);
            for (const layer of list) checkLength(`\`${layer}\``, layerSummary(layer));
        } else descriptionOf.set(feature, layerSummary(list[0] ?? ''));
        checkLength(`\`${feature}\``, descriptionOf.get(feature) ?? '');
    }

    // What imports what: layer to layer, and apps to layers.
    const layerEdges: [string, string][] = [];
    const appEdges: [string, string][] = [];
    const sources = graph.tsPaths.filter(file => !isTest(file));
    for (const file of sources) {
        const from = componentOf(file);
        const app = from === undefined ? graph.appOf(file) : undefined;
        if (from === undefined && app === undefined) continue;
        for (const { spec } of graph.importsOf(file)) {
            if (!spec.startsWith('.')) continue;
            const target = graph.resolve(file, spec);
            const to = target === undefined ? undefined : componentOf(target);
            if (to === undefined || !features.has(featureOf(to))) continue;
            if (app !== undefined) appEdges.push([app, topOf(to)]);
            else if (from !== undefined && features.has(featureOf(from)) && topOf(from) !== topOf(to)) layerEdges.push([topOf(from), topOf(to)]);
        }
    }
    const featureEdges = unique(layerEdges.filter(([a, b]) => featureOf(a) !== featureOf(b)).map(([a, b]): [string, string] => [featureOf(a), featureOf(b)]));
    const appFeatureEdges = unique(appEdges.map(([app, layer]): [string, string] => [`app:${app}`, featureOf(layer)]));
    const apps = [...new Set(appFeatureEdges.map(([app]) => app))].sort();
    const sortedFeatures = [...features.keys()].sort();
    const classes = classesOf(layers);

    // The root diagram: the features and the apps putting them together, the most core at the bottom.
    {
        const lines = ['```mermaid', init, 'flowchart TB', classes];
        for (const app of apps) lines.push(`  ${idOf(app)}[${label(basename(app.slice(4)), '')}]:::app`);
        for (const feature of sortedFeatures) lines.push(`  ${idOf(feature)}[${label(feature, descriptionOf.get(feature) ?? '')}]:::feature`);
        const edges = reduce([...featureEdges, ...appFeatureEdges]);
        for (const [a, b] of edges) lines.push(`  ${idOf(a)} --> ${idOf(b)}`);
        // Each feature using none is held on the bottom row, so the most core read as the foundation.
        const using = new Set(edges.map(([a]) => a));
        lines.push('  ground[" "]:::ground');
        for (const feature of sortedFeatures) if (!using.has(feature)) lines.push(`  ${idOf(feature)} ~~~ ground`);
        for (const feature of sortedFeatures) lines.push(`  click ${idOf(feature)} "${linkOf(feature)}"`);
        for (const app of apps) lines.push(`  click ${idOf(app)} "${app.slice(4)}"`);
        lines.push('```');
        const rows = sortedFeatures.map(feature => `| [${feature}](${linkOf(feature)}) | ${descriptionOf.get(feature) ?? ''} |`);
        const block = `Arrows point from what uses to what is used, so the most core features are at the bottom. An arrow a longer path already implies is left out. Each feature links to its own document or, when it has one layer, to that layer's README. Yellow is an app, which puts features together.\n\n${lines.join('\n')}\n\n${table(rows)}`;
        const path = 'ARCHITECTURE.md';
        set(path, replaceBlock(texts.get(path) ?? '# Architecture\n\n> The features of the app and what uses what; start here and follow the links down.\n', block));
    }

    // A feature's document: its layers, what they import, and the features they use.
    const featureNext = new Map<string, Set<string>>();
    for (const [a, b] of featureEdges) {
        let next = featureNext.get(a);
        if (next === undefined) featureNext.set(a, next = new Set());
        next.add(b);
    }
    const reachable = (from: string): Set<string> => {
        const seen = new Set<string>();
        const stack = [...(featureNext.get(from) ?? [])];
        for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
            if (seen.has(node)) continue;
            seen.add(node);
            stack.push(...(featureNext.get(node) ?? []));
        }
        return seen;
    };
    for (const [feature, list] of features) {
        if (!hasDoc(feature)) continue;
        const own = new Set(list);
        const inside = reduce(unique(layerEdges.filter(([a, b]) => own.has(a) && own.has(b))));
        const lines = ['```mermaid', init, 'flowchart TB', classes, `  subgraph ${idOf('self')} ["${escape(feature)}"]`];
        for (const layer of list) lines.push(`    ${idOf(layer)}[${label(basename(layer), layerSummary(layer))}]:::${basename(layer)}`);
        lines.push('  end');
        const outside: [string, string][] = [];
        for (const layer of list) {
            const used = [...new Set(layerEdges.filter(([a, b]) => a === layer && !own.has(b)).map(([, b]) => featureOf(b)))];
            const implied = new Set(used.flatMap(other => [...reachable(other)]));
            for (const other of used.filter(other => !implied.has(other))) outside.push([layer, other]);
        }
        const others = [...new Set(outside.map(([, other]) => other))].sort();
        for (const other of others) lines.push(`  ${idOf('uses', other)}[${label(other, descriptionOf.get(other) ?? '')}]:::feature`);
        for (const [a, b] of inside) lines.push(`  ${idOf(a)} --> ${idOf(b)}`);
        for (const [a, other] of outside) lines.push(`  ${idOf(a)} --> ${idOf('uses', other)}`);
        for (const layer of list) lines.push(`  click ${idOf(layer)} "${relative(feature, layer)}/README.md"`);
        for (const other of others) lines.push(`  click ${idOf('uses', other)} "${relative(feature, linkOf(other))}"`);
        lines.push('```');
        const rows = list.map(layer => `| [${basename(layer)}](${relative(feature, layer)}/README.md) | ${layerSummary(layer)} |`);
        const block = `Arrows point from a layer to what it uses. The boxes below are other features this one uses; one that another of its uses already brings in is left out.\n\n${lines.join('\n')}\n\n${table(rows)}`;
        set(docPath(feature), replaceBlock(texts.get(docPath(feature)) ?? '', block));
    }

    // A layer with many parts has a diagram of them in its README.
    for (const list of features.values()) {
        for (const layer of list) {
            const parts = components.filter(component => component.startsWith(`${layer}/`));
            const readme = `${layer}/README.md`;
            const text = texts.get(readme);
            if (text === undefined) continue;
            if (parts.length < minPartsForDiagram) {
                set(readme, removeBlock(text));
                continue;
            }
            const within = (file: string): string | undefined => {
                const component = componentOf(file);
                return component !== undefined && component.startsWith(`${layer}/`) ? component : undefined;
            };
            const edges: [string, string][] = [];
            for (const file of sources) {
                const from = within(file);
                if (from === undefined) continue;
                for (const { spec } of graph.importsOf(file)) {
                    if (!spec.startsWith('.')) continue;
                    const target = graph.resolve(file, spec);
                    const to = target === undefined ? undefined : within(target);
                    if (to !== undefined && to !== from && !to.startsWith(`${from}/`)) edges.push([from, to]);
                }
            }
            const lines = ['```mermaid', init, 'flowchart TB', classes];
            const draw = (parent: string, depth: number): void => {
                for (const part of parts.filter(component => componentOf(component) === parent)) {
                    const pad = '  '.repeat(depth);
                    if (!parts.some(component => componentOf(component) === part)) {
                        lines.push(`${pad}${idOf(part)}[${label(basename(part), '')}]:::${basename(layer)}`);
                        continue;
                    }
                    lines.push(`${pad}subgraph ${idOf(part)} ["${escape(basename(part))}"]`);
                    draw(part, depth + 1);
                    lines.push(`${pad}end`);
                }
            };
            draw(layer, 1);
            for (const [a, b] of reduce(unique(edges))) lines.push(`  ${idOf(a)} --> ${idOf(b)}`);
            lines.push('```');
            set(readme, replaceBlock(text, `The parts, and what each uses (arrows point to what is used):\n\n${lines.join('\n')}`));
        }
    }
    return { updates, problems };
};
