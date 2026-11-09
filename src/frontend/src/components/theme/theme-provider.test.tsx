import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider } from './theme-provider';

// The app renders light only (the Mantine shell is light), whatever the OS or
// an old stored choice says.
describe('ThemeProvider with forcedTheme', () => {
  afterEach(() => {
    document.documentElement.classList.remove('light', 'dark');
    vi.restoreAllMocks();
  });

  it('ignores a stored dark theme', () => {
    localStorage.setItem('ucapp-theme', 'dark');
    render(<ThemeProvider forcedTheme="light" storageKey="ucapp-theme"><div /></ThemeProvider>);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('ignores a dark OS setting', () => {
    localStorage.setItem('ucapp-theme', 'system');
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: query.includes('dark'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList,
    );
    render(<ThemeProvider forcedTheme="light" storageKey="ucapp-theme"><div /></ThemeProvider>);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('still follows a dark OS without it', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: query.includes('dark'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList,
    );
    render(<ThemeProvider defaultTheme="system" storageKey="ucapp-theme"><div /></ThemeProvider>);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
