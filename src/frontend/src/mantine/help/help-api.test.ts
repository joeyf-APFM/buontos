import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHelpArticle, fetchHelpArticles, searchHelp } from './help-api';

const respond = (status: number, body: unknown = {}) =>
  vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });

afterEach(() => vi.unstubAllGlobals());

describe('help-api', () => {
  it('fetches the article list', async () => {
    const fetchMock = respond(200, [{ slug: 'a' }]);
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchHelpArticles()).toEqual([{ slug: 'a' }]);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/help/articles');
  });

  it('returns null for a 404 article', async () => {
    vi.stubGlobal('fetch', respond(404, { detail: 'Help article not found' }));
    expect(await fetchHelpArticle('nope')).toBeNull();
  });

  it('throws on a 500', async () => {
    vi.stubGlobal('fetch', respond(500));
    await expect(fetchHelpArticle('a')).rejects.toThrow();
    await expect(fetchHelpArticles()).rejects.toThrow();
    await expect(searchHelp('x')).rejects.toThrow();
  });

  it('url-encodes the search query and passes the signal', async () => {
    const fetchMock = respond(200, []);
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await searchHelp('a b&c/d', controller.signal);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/help/search?q=a%20b%26c%2Fd&limit=20');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
  });

  it('encodes the slug', async () => {
    const fetchMock = respond(200, { slug: 'a b' });
    vi.stubGlobal('fetch', fetchMock);
    await fetchHelpArticle('a b');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/help/articles/a%20b');
  });
});
