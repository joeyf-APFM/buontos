import { describe, expect, it } from 'vitest';
import { computeSectionAnchors, createAnchorGenerator, slugifyHeading } from './help-slug';

describe('slugifyHeading', () => {
  it('matches the backend vectors', () => {
    expect(slugifyHeading('Working with Domains')).toBe('working-with-domains');
    expect(slugifyHeading("What's a data product?")).toBe('whats-a-data-product');
    expect(slugifyHeading('A  --  B')).toBe('a-b');
  });
});

describe('createAnchorGenerator', () => {
  it('suffixes repeated headings', () => {
    const next = createAnchorGenerator();
    expect(next('Setup')).toBe('setup');
    expect(next('Setup')).toBe('setup-2');
    expect(next('Setup')).toBe('setup-3');
  });

  it('is collision safe like the backend', () => {
    const next = createAnchorGenerator();
    expect([next('Setup'), next('Setup'), next('Setup 2')]).toEqual(['setup', 'setup-2', 'setup-2-2']);
  });

  it('falls back to "section" for empty slugs', () => {
    const next = createAnchorGenerator();
    expect([next('???'), next('!!!')]).toEqual(['section', 'section-2']);
  });

  it('reserves overview like the backend', () => {
    expect(createAnchorGenerator()('Overview')).toBe('overview-2');
  });
});

describe('computeSectionAnchors', () => {
  it('numbers duplicates and collisions like the backend', () => {
    expect(computeSectionAnchors('## Setup\n## Setup\n## Setup 2\n')).toEqual(['setup', 'setup-2', 'setup-2-2']);
  });

  it('reserves overview among ## headings', () => {
    expect(computeSectionAnchors('## Overview\n')).toEqual(['overview-2']);
  });

  it('ignores # and deeper headings, which consume no counter', () => {
    expect(computeSectionAnchors('# Setup\n\n## Setup\n')).toEqual(['setup']);
    expect(computeSectionAnchors('### Setup\n\n## Setup\n')).toEqual(['setup']);
    expect(computeSectionAnchors('# Overview\n\n## Intro\n')).toEqual(['intro']);
  });

  it('slugifies raw markdown text', () => {
    expect(computeSectionAnchors('## [Docs](x)\n## `a_b`\n')).toEqual(['docsx', 'ab']);
  });

  it('skips fenced blocks, closing only on the same marker', () => {
    const md = '## A\n```\n## Hidden\n~~~\n## Still hidden\n```\n## B\n~~~\n## Hidden 2\n```\n~~~\n## C\n';
    expect(computeSectionAnchors(md)).toEqual(['a', 'b', 'c']);
  });

  it('uses the section fallback and the working vectors', () => {
    expect(computeSectionAnchors('## ???\n## What\'s a data product?\n')).toEqual(['section', 'whats-a-data-product']);
  });
});
