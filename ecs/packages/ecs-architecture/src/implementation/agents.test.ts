// © 2026 Adobe. MIT License. See /LICENSE for details.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { agentFiles, maxInstructions, nameOf, parseRule, type RuleSource } from './agents.js';

const rule = (glob: string, body: string): RuleSource => ({ glob, body });

/** The rule sources a package ships, in its `rules` folder. */
const shipped = (folder: URL): RuleSource[] => readdirSync(folder).filter(name => name.endsWith('.md') && name !== 'AGENTS.md')
    .map(name => parseRule(readFileSync(new URL(name, folder), 'utf8'))).filter(each => each !== undefined);
const ownRules = new URL('../../rules/', import.meta.url);
const ecsRules = new URL('../../../ecs/rules/', import.meta.url);

describe('naming a rule\'s file for the paths it covers', () => {
    it('writes each wildcard as _ and drops the leading one', () => {
        expect(nameOf('**/system.*.ts')).toBe('system._.ts');
        expect(nameOf('**/model/**')).toBe('model/_');
        expect(nameOf('**/constant.systems.ts')).toBe('constant.systems.ts');
        expect(nameOf('**/ARCHITECTURE.md')).toBe('ARCHITECTURE.md');
    });

    it('gives each glob the packages ship its own name', () => {
        const globs = [...new Set([...shipped(ownRules), ...shipped(ecsRules)].map(each => each.glob))];
        expect(globs.filter(glob => glob.includes('_'))).toEqual([]);
        expect(new Set(globs.map(nameOf)).size).toBe(globs.length);
    });
});

describe('reading a rule source', () => {
    it('takes its glob from its front matter and the rest as its body', () => {
        expect(parseRule('---\nglob: "**/system.*.ts"\n---\n- Do it.\n')).toEqual({ glob: '**/system.*.ts', body: '- Do it.' });
        expect(parseRule('- No front matter.\n')).toBeUndefined();
    });
});

describe('the agent files', () => {
    const summary = 'Follow the standard.';

    it('write the rules of each glob for Claude Code and Copilot, both packages\' bodies in one file', () => {
        const { write } = agentFiles(summary, [rule('**/system.*.ts', '- Typed.'), rule('**/system.*.ts', '- Queries.')], {});
        expect(write['.claude/rules/ecs/system._.ts.md']).toMatch(/^---\npaths:\n {2}- "\*\*\/system\.\*\.ts"\n---\n[\s\S]*- Typed\.\n- Queries\.\n$/);
        expect(write['.github/instructions/ecs/system._.ts.instructions.md']).toMatch(/^---\napplyTo: "\*\*\/system\.\*\.ts"\n---\n[\s\S]*- Typed\.\n- Queries\.\n$/);
    });

    it('put the summary between markers in AGENTS.md, keeping what\'s around them', () => {
        expect(agentFiles(summary, [], {}).write['AGENTS.md']).toContain('<!-- ecs-architecture:start -->\nFollow the standard.\n<!-- ecs-architecture:end -->');
        const existing = '# Agents\n\nBefore.\n\n<!-- ecs-architecture:start -->\nold\n<!-- ecs-architecture:end -->\n\nAfter.\n';
        const text = agentFiles(summary, [], { 'AGENTS.md': existing }).write['AGENTS.md'];
        expect(text).toBe('# Agents\n\nBefore.\n\n<!-- ecs-architecture:start -->\nFollow the standard.\n<!-- ecs-architecture:end -->\n\nAfter.\n');
    });

    it('import AGENTS.md from a CLAUDE.md at the root, and create no CLAUDE.md', () => {
        expect(agentFiles(summary, [], {}).write['CLAUDE.md']).toBeUndefined();
        expect(agentFiles(summary, [], { 'CLAUDE.md': '# Project\n' }).write['CLAUDE.md']).toBe('# Project\n\n@AGENTS.md\n');
        expect(agentFiles(summary, [], { 'CLAUDE.md': '# Project\n\n@AGENTS.md\n' }).write['CLAUDE.md']).toBeUndefined();
    });

    it('write nothing that\'s current, and remove the rules of a glob no source has', () => {
        const first = agentFiles(summary, [rule('**/system.*.ts', '- Typed.')], { '.claude/rules/ecs/gone._.ts.md': 'old' });
        expect(first.remove).toEqual(['.claude/rules/ecs/gone._.ts.md']);
        const again = agentFiles(summary, [rule('**/system.*.ts', '- Typed.')], first.write);
        expect(again).toEqual({ write: {}, remove: [] });
    });

    it('stay small enough for Copilot\'s code review to read whole, from the rules the packages ship', () => {
        const sources = [...shipped(ownRules), ...shipped(ecsRules)];
        expect(sources.length).toBeGreaterThan(10);
        const { write } = agentFiles(readFileSync(new URL('AGENTS.md', ownRules), 'utf8'), sources, {});
        for (const [path, text] of Object.entries(write)) {
            expect([path, text.length <= maxInstructions]).toEqual([path, true]);
        }
        expect(write['AGENTS.md']?.length).toBeLessThan(1500);
    });
});
