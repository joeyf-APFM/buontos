import { describe, expect, it } from 'vitest';
import { createAnchorGenerator, slugifyHeading } from './help-slug';

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
