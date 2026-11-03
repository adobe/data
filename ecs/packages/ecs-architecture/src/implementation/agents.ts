// © 2026 Adobe. MIT License. See /LICENSE for details.

/** A rule's text and the files it's for, read from a rule source: `glob:` in its front matter, then its body. */
export type RuleSource = { readonly glob: string; readonly body: string };

/** Where the generated rules live, under the repository's root: folders these files own alone. */
export const claudeRules = '.claude/rules/ecs';
export const copilotInstructions = '.github/instructions/ecs';

const blockStart = '<!-- ecs-architecture:start -->';
const blockEnd = '<!-- ecs-architecture:end -->';
const generated = '<!-- Written by `ecs-architecture agents` from the rules of @adobe/ecs-architecture and @adobe/ecs: run it again, never edit. -->';

/** The most an instructions file holds, so Copilot's code review reads it whole. */
export const maxInstructions = 4000;

/** A rule source's glob and body, or undefined when it has no `glob:` front matter. */
export const parseRule = (text: string): RuleSource | undefined => {
    const match = /^---\n(?:.*\n)*?glob: "([^"]+)"\n(?:.*\n)*?---\n([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'));
    const glob = match?.[1];
    const body = match?.[2];
    return glob === undefined || body === undefined ? undefined : { glob, body: body.trim() };
};

/**
 * A glob as the name of the file holding its rules, which reads as the paths it covers: each `*` or `**` is a `_`,
 * and the leading folder wildcard is dropped, so the rules for `system.*.ts` in any folder are in `system._.ts`, and
 * those for any file under a `model` folder in `model/_`. Names are distinct while no glob has a `_` of its own.
 */
export const nameOf = (glob: string): string => glob.replace(/^\*\*\//, '').replace(/\*\*?/g, '_');

/** What the repository's agent files are to be: each file to write with its text, and each to remove. */
export type AgentFiles = { readonly write: Readonly<Record<string, string>>; readonly remove: readonly string[] };

/**
 * The agent files of a repository, by their paths under its root: `AGENTS.md`, holding `summary` between its markers,
 * and for each glob its rules for Claude Code, `.claude/rules/ecs/<name>.md`, and for Copilot,
 * `.github/instructions/ecs/<name>.instructions.md`. A `CLAUDE.md` at the root imports `AGENTS.md`, since Claude Code
 * doesn't read `AGENTS.md` beside one. `existing` holds the root's `AGENTS.md` and `CLAUDE.md` and every file of the
 * rules' folders; those it doesn't write are removed.
 */
export const agentFiles = (summary: string, rules: readonly RuleSource[], existing: Readonly<Record<string, string>>): AgentFiles => {
    const write: Record<string, string> = {};
    const want = (path: string, text: string): void => {
        if (existing[path] !== text) write[path] = text;
    };
    const block = `${blockStart}\n${summary.trim()}\n${blockEnd}`;
    const agents = existing['AGENTS.md'];
    const at = agents?.indexOf(blockStart) ?? -1;
    const to = agents?.indexOf(blockEnd) ?? -1;
    want('AGENTS.md', agents === undefined ? `# Agents\n\n${block}\n`
        : at >= 0 && to > at ? `${agents.slice(0, at)}${block}${agents.slice(to + blockEnd.length)}` : `${agents.replace(/\n*$/, '\n')}\n${block}\n`);
    const claude = existing['CLAUDE.md'];
    if (claude !== undefined && !/^@AGENTS\.md\s*$/m.test(claude)) want('CLAUDE.md', `${claude.replace(/\n*$/, '\n')}\n@AGENTS.md\n`);
    const bodies = new Map<string, string[]>();
    for (const { glob, body } of rules) {
        let list = bodies.get(glob);
        if (list === undefined) bodies.set(glob, list = []);
        list.push(body);
    }
    const owned = new Set<string>();
    for (const [glob, list] of [...bodies].sort(([a], [b]) => a.localeCompare(b))) {
        const text = `${generated}\n\n${list.join('\n')}\n`;
        const claudePath = `${claudeRules}/${nameOf(glob)}.md`;
        const copilotPath = `${copilotInstructions}/${nameOf(glob)}.instructions.md`;
        owned.add(claudePath).add(copilotPath);
        want(claudePath, `---\npaths:\n  - "${glob}"\n---\n${text}`);
        want(copilotPath, `---\napplyTo: "${glob}"\n---\n${text}`);
    }
    const remove = Object.keys(existing).filter(path => (path.startsWith(`${claudeRules}/`) || path.startsWith(`${copilotInstructions}/`)) && !owned.has(path)).sort();
    return { write, remove };
};
