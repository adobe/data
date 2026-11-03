// © 2026 Adobe. MIT License. See /LICENSE for details.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { run } from './run.js';

const folders: string[] = [];
afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** A repository holding an app package at `app/`, with `files` in its source folder. */
const repository = (files: Readonly<Record<string, string>>, manifest: object = {}): string => {
    const root = mkdtempSync(join(tmpdir(), 'ecs-architecture-'));
    folders.push(root);
    mkdirSync(join(root, '.git'));
    const app = join(root, 'app');
    mkdirSync(app);
    writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'app', ...manifest }));
    for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(app, 'src', path)), { recursive: true });
        writeFileSync(join(app, 'src', path), text);
    }
    return root;
};

const valid = {
    'thing/model/README.md': '# model\n\nThe things.\n',
    'thing/model/index.ts': "export * from './component.thing.js';\nexport * from './constant.systems.js';\n",
    'thing/model/component.thing.ts': '/** A thing. */\nexport const thing = Symbol();\n',
    'thing/model/constant.systems.ts': "import type { System } from '@adobe/ecs';\n\nexport const systems: readonly System[] = [];\n",
    'app/main.ts': "import { thing } from '../thing/model/index.js';\nexport const app = thing;\n",
};

describe('ecs-architecture check', () => {
    it('reports a source that follows the standard, and exits 0', () => {
        const root = repository(valid);
        expect(run(['check'], join(root, 'app'))).toEqual({ output: 'architecture ok: 5 files, no violations\n', code: 0 });
    });

    it('reports each violation with its fix, as text or as GitHub annotations by the file\'s path in the repository, and exits 1', () => {
        const root = repository({ ...valid, 'stray.ts': 'export {};\n' });
        const text = run(['check'], join(root, 'app'));
        expect(text.code).toBe(1);
        expect(text.output).toContain('stray.ts\n  [src-root-files]');
        const github = run(['check', '--format', 'github'], join(root, 'app'));
        expect(github.output).toMatch(/^::error file=app\/src\/stray.ts,title=src-root-files::stray.ts is in the root/);
        expect(JSON.parse(run(['check', '--format', 'json'], join(root, 'app')).output)).toEqual([expect.objectContaining({ file: 'stray.ts', rule: 'src-root-files' })]);
    });

    it('reads its configuration from package.json, and says what\'s wrong with it', () => {
        const root = repository({ ...valid, 'thing/model/component.thing.ts': '/** A thing. */\nexport const thing = Symbol();\n' }, { ecsArchitecture: { kinds: ['component', 'constant'] } });
        expect(run(['check'], join(root, 'app')).code).toBe(0);
        const wrong = repository(valid, { ecsArchitecture: { kind: [] } });
        expect(run(['check'], join(wrong, 'app'))).toEqual({ output: '"ecsArchitecture.kind" isn\'t a setting: source, layers, kinds, apps, headless, systems or banned.\n', code: 2 });
    });
});

describe('ecs-architecture diagrams', () => {
    it('writes the diagrams, and then finds them current', () => {
        const root = repository(valid);
        const app = join(root, 'app');
        expect(run(['diagrams', '--check'], app)).toEqual({ output: 'out of date: ARCHITECTURE.md (run ecs-architecture diagrams)\n', code: 1 });
        expect(run(['diagrams'], app)).toEqual({ output: 'wrote ARCHITECTURE.md\n', code: 0 });
        expect(readFileSync(join(app, 'src', 'ARCHITECTURE.md'), 'utf8')).toContain('<!-- architecture:start -->');
        expect(run(['diagrams', '--check'], app)).toEqual({ output: 'diagrams ok\n', code: 0 });
    });
});

describe('ecs-architecture agents', () => {
    it('writes the agent files at the repository\'s root from both packages\' rules, and then finds them current', () => {
        const root = repository(valid);
        writeFileSync(join(root, 'CLAUDE.md'), '# Repository\n');
        const app = join(root, 'app');
        expect(run(['agents', '--check'], app).code).toBe(1);
        expect(run(['agents'], app).code).toBe(0);
        expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toBe('# Repository\n\n@AGENTS.md\n');
        const system = readFileSync(join(root, '.claude', 'rules', 'ecs', 'system._.ts.md'), 'utf8');
        expect(system).toContain('typed as its interface');
        expect(system).toContain('Read entities with a query');
        expect(readFileSync(join(root, '.github', 'instructions', 'ecs', 'model', '_.instructions.md'), 'utf8')).toContain('applyTo: "**/model/**"');
        expect(run(['agents', '--check'], app)).toEqual({ output: 'agent rules ok\n', code: 0 });
    });
});

describe('a missing source folder', () => {
    it('is reported, not taken for a source with nothing wrong', () => {
        const root = repository(valid, { ecsArchitecture: { source: 'lib' } });
        expect(run(['check'], join(root, 'app'))).toEqual({ output: `No source folder ${join(root, 'app', 'lib')}: set "ecsArchitecture.source" in package.json.\n`, code: 2 });
    });
});
