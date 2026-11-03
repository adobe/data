// © 2026 Adobe. MIT License. See /LICENSE for details.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../../check.js';
import type { Config } from '../../config.js';
import { diagrams } from '../../diagrams.js';
import type { Violation } from '../../violation.js';
import { agentFiles, claudeRules, copilotInstructions, parseRule, type RuleSource } from '../agents.js';
import { configOf } from './config-of.js';

/** What a command printed and the code it exits with. */
export type Outcome = { readonly output: string; readonly code: number };

const usage = `Usage: ecs-architecture <command> [options], in the app's package folder

  check [--format text|github|json]   report what breaks the standard, 1 if anything does
  diagrams [--check]                  write the architecture diagrams, or say which are out of date
  agents [--check]                    write the agent rules at the repository's root, or say which are out of date
`;

/** Runs a command, as `ecs-architecture` with `args`, for the package in `folder`. */
export const run = (args: readonly string[], folder: string): Outcome => {
    const [command, ...options] = args;
    const read = readConfig(folder);
    if (typeof read === 'string') return { output: `${read}\n`, code: 2 };
    const source = join(folder, read.source ?? 'src');
    if ((command === 'check' || command === 'diagrams') && !existsSync(source)) return { output: `No source folder ${source}: set "ecsArchitecture.source" in package.json.\n`, code: 2 };
    switch (command) {
        case 'check': return runCheck(options, source, read);
        case 'diagrams': return runDiagrams(options.includes('--check'), source, read);
        case 'agents': return runAgents(options.includes('--check'), folder);
        default: return { output: usage, code: command === undefined || command === '--help' ? 0 : 2 };
    }
};

/** The package's configuration, its package.json's `ecsArchitecture`, or what's wrong with it. */
const readConfig = (folder: string): Config | string => {
    const path = join(folder, 'package.json');
    if (!existsSync(path)) return `No package.json in ${folder}: run ecs-architecture in the app's package folder.`;
    const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'));
    const value = typeof manifest === 'object' && manifest !== null ? Reflect.get(manifest, 'ecsArchitecture') : undefined;
    return value === undefined ? {} : configOf(value);
};

/** Every `.ts` and `.md` file under `folder`, by its posix path there, but those in `node_modules` and dot folders. */
const filesOf = (folder: string): Record<string, string> => {
    const files: Record<string, string> = {};
    const visit = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const path = join(dir, entry.name);
            if (entry.isDirectory()) visit(path);
            else if (entry.isFile() && /\.(ts|md)$/.test(entry.name)) files[relative(folder, path).split(sep).join('/')] = readFileSync(path, 'utf8');
        }
    };
    if (existsSync(folder)) visit(folder);
    return files;
};

/** The repository's root: the nearest folder holding `.git`, or `folder` itself outside one. */
const repositoryOf = (folder: string): string => {
    for (let dir = folder; ; dir = dirname(dir)) {
        if (existsSync(join(dir, '.git'))) return dir;
        if (dirname(dir) === dir) return folder;
    }
};

/** A property value of a workflow command, escaped as GitHub reads it. */
const escapeProperty = (text: string): string => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/:/g, '%3A').replace(/,/g, '%2C');
const escapeData = (text: string): string => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

const runCheck = (options: readonly string[], source: string, config: Config): Outcome => {
    const at = options.indexOf('--format');
    const format = at < 0 ? 'text' : options[at + 1];
    if (format !== 'text' && format !== 'github' && format !== 'json') return { output: `Unknown format ${format}: text, github or json.\n`, code: 2 };
    const files = filesOf(source);
    const violations = check(files, config);
    const code = violations.length === 0 ? 0 : 1;
    if (format === 'json') return { output: `${JSON.stringify(violations, null, 2)}\n`, code };
    if (format === 'github') {
        const root = repositoryOf(source);
        const pathOf = (violation: Violation): string => relative(root, join(source, violation.file)).split(sep).join('/');
        return { output: violations.map(violation => `::error file=${escapeProperty(pathOf(violation))},title=${escapeProperty(violation.rule)}::${escapeData(`${violation.problem} Fix: ${violation.fix}`)}\n`).join(''), code };
    }
    if (violations.length === 0) return { output: `architecture ok: ${Object.keys(files).length} files, no violations\n`, code };
    const listed = violations.map(violation => `${violation.file}\n  [${violation.rule}] ${violation.problem}\n  fix: ${violation.fix}\n`).join('\n');
    return { output: `${listed}\n${violations.length} violation(s). The standard is node_modules/@adobe/ecs-architecture/standard.md.\n`, code };
};

const runDiagrams = (checking: boolean, source: string, config: Config): Outcome => {
    const { updates, problems } = diagrams(filesOf(source), config);
    const lines = problems.map(problem => `problem: ${problem}`);
    const paths = Object.keys(updates).sort();
    if (checking) {
        lines.push(...paths.map(path => `out of date: ${path} (run ecs-architecture diagrams)`));
        if (problems.length === 0 && paths.length === 0) lines.push('diagrams ok');
        return { output: `${lines.join('\n')}\n`, code: problems.length > 0 || paths.length > 0 ? 1 : 0 };
    }
    for (const path of paths) {
        const target = join(source, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, updates[path] ?? '');
        lines.push(`wrote ${path}`);
    }
    if (lines.length === 0) lines.push('diagrams ok');
    return { output: `${lines.join('\n')}\n`, code: problems.length > 0 ? 1 : 0 };
};

/** The rule sources in a package's `rules` folder. */
const rulesIn = (folder: string): RuleSource[] => {
    if (!existsSync(folder)) return [];
    return readdirSync(folder).filter(name => name.endsWith('.md')).sort()
        .map(name => parseRule(readFileSync(join(folder, name), 'utf8'))).filter(rule => rule !== undefined);
};

/** The folder of the installed `@adobe/ecs`, from the module its root export resolves to. */
const ecsFolder = (): string | undefined => {
    let resolved: string;
    try {
        resolved = fileURLToPath(import.meta.resolve('@adobe/ecs'));
    } catch {
        return undefined;
    }
    for (let dir = dirname(resolved); dirname(dir) !== dir; dir = dirname(dir)) {
        const manifest = join(dir, 'package.json');
        if (existsSync(manifest) && /"name":\s*"@adobe\/ecs"/.test(readFileSync(manifest, 'utf8'))) return dir;
    }
    return undefined;
};

/** Every file under `folder` of the repository at `root`, by its posix path from the root. */
const filesUnder = (root: string, folder: string): Record<string, string> => {
    const files: Record<string, string> = {};
    const visit = (dir: string): void => {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) visit(path);
            else if (entry.isFile()) files[relative(root, path).split(sep).join('/')] = readFileSync(path, 'utf8');
        }
    };
    visit(join(root, folder));
    return files;
};

const runAgents = (checking: boolean, folder: string): Outcome => {
    const ownRules = fileURLToPath(new URL('../../../rules/', import.meta.url));
    const ecs = ecsFolder();
    if (ecs === undefined) return { output: 'Can\'t find @adobe/ecs: install it beside @adobe/ecs-architecture.\n', code: 2 };
    const root = repositoryOf(folder);
    const existing: Record<string, string> = { ...filesUnder(root, claudeRules), ...filesUnder(root, copilotInstructions) };
    for (const name of ['AGENTS.md', 'CLAUDE.md']) if (existsSync(join(root, name))) existing[name] = readFileSync(join(root, name), 'utf8');
    const summary = readFileSync(join(ownRules, 'AGENTS.md'), 'utf8');
    const { write, remove } = agentFiles(summary, [...rulesIn(ownRules), ...rulesIn(join(ecs, 'rules'))], existing);
    const paths = Object.keys(write).sort();
    if (checking) {
        const stale = [...paths, ...remove].sort().map(path => `out of date: ${path} (run ecs-architecture agents)`);
        return { output: `${stale.length === 0 ? 'agent rules ok' : stale.join('\n')}\n`, code: stale.length === 0 ? 0 : 1 };
    }
    const lines: string[] = [];
    for (const path of paths) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), write[path] ?? '');
        lines.push(`wrote ${path}`);
    }
    for (const path of remove) {
        rmSync(join(root, path));
        lines.push(`removed ${path}`);
    }
    return { output: `${lines.length === 0 ? 'agent rules ok' : lines.join('\n')}\n`, code: 0 };
};
