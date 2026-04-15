import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CodeUiParserService } from '../../src/core/code-ui-parser';

test('code-ui parser converts React TSX into UiModel with source mapping and basic style hints', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'code-ui-parser-'));
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(
      join(rootDir, 'src', 'components', 'Hero.tsx'),
      `
        import React from 'react';

        const Wrapper = ({ children }: { children: React.ReactNode }) => (
          <section data-ui-id="landing.wrapper" className="flex flex-col gap-6 p-16 rounded-2xl bg-slate-50">{children}</section>
        );

        export function Hero() {
          return (
            <Wrapper>
              <section data-ui-id="landing.hero" className="flex flex-col gap-6 p-16 rounded-2xl bg-brand-surface">
                <h1 data-ui-id="landing.hero.title" className="text-5xl text-center">Build faster</h1>
                <button data-ui-id="landing.hero.cta" className="rounded-lg">Start</button>
              </section>
            </Wrapper>
          );
        }
      `,
      'utf8'
    );

    const service = new CodeUiParserService({ rootDir });
    const result = service.parseProject({ componentName: 'Hero' });

    assert.equal(result.componentCount, 1);
    assert.equal(result.components[0].componentName, 'Hero');
    assert.equal(result.components[0].filePath, 'src/components/Hero.tsx');

    const root = result.components[0].tree.root;
    assert.equal(root.kind, 'component_instance');
    assert.equal(root.name, 'Wrapper');
    assert.equal(root.source?.codePath, 'src/components/Hero.tsx');
    assert.equal(typeof root.source?.lineStart, 'number');
    assert.equal(root.children[0].uiId, 'landing.wrapper');
    assert.equal(root.children[0].layout?.type, 'vertical');
    assert.equal(root.children[0].spacing, 24);
    assert.equal(root.children[0].padding?.top, 64);
    assert.equal(root.children[0].style?.radius, 16);
    assert.equal(root.children[0].children[0].uiId, 'landing.hero');
    assert.equal(root.children[0].children[0].children[0].uiId, 'landing.hero.title');
    assert.equal(root.children[0].children[0].children[0].text, 'Build faster');
    assert.equal(root.children[0].children[0].children[0].style?.text?.fontSize, 48);
    assert.equal(root.children[0].children[0].children[0].style?.text?.textAlign, 'center');
    assert.equal(root.children[0].children[0].children[1].kind, 'button');
    assert.equal(root.children[0].children[0].children[1].text, 'Start');
    assert.match(String(root.children[0].children[0].children[0].source?.jsxPath), /Hero/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
