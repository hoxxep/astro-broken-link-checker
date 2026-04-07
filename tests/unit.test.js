import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execa } from 'execa';
import { checkLinksInHtml, normalizeHtmlFilePath, loadExternalLinkCache, saveExternalLinkCache } from '../check-links.js';

const testsDir = import.meta.dirname;
const distPath = path.join(testsDir, 'dist');
const logger = { info: () => {}, error: () => {} };

// Ensure the default test site is built so dist/ exists for file-existence checks
beforeAll(async () => {
  if (!fs.existsSync(path.join(distPath, 'index.html'))) {
    await execa('npm', ['run', 'build'], { cwd: testsDir });
  }
}, 60000);

// Helper: run checkLinksInHtml and return broken link keys
async function getBrokenLinks(html, opts = {}) {
  const brokenLinksMap = opts.brokenLinksMap || new Map();
  const checkedLinks = opts.checkedLinks || new Map();
  await checkLinksInHtml(
    html,
    brokenLinksMap,
    opts.baseUrl || '/',
    opts.documentPath || '/fake/index.html',
    checkedLinks,
    opts.distPath ?? distPath,
    opts.redirects || {},
    logger,
    opts.checkExternalLinks ?? false,
    opts.trailingSlash || 'ignore',
    opts.externalLinkCache || null,
    opts.base || '',
  );
  return brokenLinksMap;
}

describe('trailingSlash enforcement', () => {
  it('always: flags links without trailing slash', async () => {
    const map = await getBrokenLinks(
      '<a href="/about">About</a>',
      { trailingSlash: 'always' }
    );
    expect(map.has('/about')).toBe(true);
  });

  it('always: allows links with trailing slash', async () => {
    const map = await getBrokenLinks(
      '<a href="/about/">About</a>',
      { trailingSlash: 'always' }
    );
    expect(map.has('/about/')).toBe(false);
  });

  it('always: allows links with file extensions', async () => {
    const map = await getBrokenLinks(
      '<a href="/exists.jpg">Image</a>',
      { trailingSlash: 'always' }
    );
    expect(map.has('/exists.jpg')).toBe(false);
  });

  it('ignore: allows both with and without trailing slash', async () => {
    const map = await getBrokenLinks(
      '<a href="/about">A</a><a href="/about/">B</a>',
      { trailingSlash: 'ignore' }
    );
    expect(map.has('/about')).toBe(false);
    expect(map.has('/about/')).toBe(false);
  });

  it('never: flags links with trailing slash (except root)', async () => {
    const map = await getBrokenLinks(
      '<a href="/about/">About</a><a href="/">Root</a>',
      { trailingSlash: 'never' }
    );
    expect(map.has('/about/')).toBe(true);
    expect(map.has('/')).toBe(false);
  });
});

describe('checkExternalLinks: false', () => {
  it('skips external URLs but catches internal broken links', async () => {
    const map = await getBrokenLinks(
      '<a href="http://example.invalid/page">Ext</a><a href="/non-existent">Int</a>',
      { checkExternalLinks: false }
    );
    expect(map.has('/non-existent')).toBe(true);
    expect(map.has('http://example.invalid/page')).toBe(false);
  });
});

describe('relative link resolution', () => {
  it('resolves ../ from /about/ to /', async () => {
    const map = await getBrokenLinks(
      '<a href="../">Up</a>',
      { baseUrl: '/about/' }
    );
    // ../ from /about/ resolves to /, which exists as dist/index.html
    expect(map.size).toBe(0);
  });

  it('resolves ./ from /about/ to /about/', async () => {
    const map = await getBrokenLinks(
      '<a href="./">Self</a>',
      { baseUrl: '/about/' }
    );
    // ./ from /about/ resolves to /about/, which exists as dist/about/index.html
    expect(map.size).toBe(0);
  });
});

describe('query strings and fragments on valid links', () => {
  it('valid internal link with query string is not broken', async () => {
    const map = await getBrokenLinks('<a href="/about?foo=bar">About</a>');
    expect(map.has('/about?foo=bar')).toBe(false);
  });

  it('valid internal link with fragment is not broken', async () => {
    const map = await getBrokenLinks('<a href="/about#section">About</a>');
    expect(map.has('/about#section')).toBe(false);
  });
});

describe('deduplication and grouping', () => {
  it('same broken link from two pages groups into one entry with two documents', async () => {
    const brokenLinksMap = new Map();
    const checkedLinks = new Map();

    // Use distPath='' so document paths are normalized from the raw path
    await checkLinksInHtml(
      '<a href="/non-existent">Link</a>',
      brokenLinksMap, '/page-one/', '/page-one/index.html',
      checkedLinks, distPath, {}, logger, false, 'ignore', null, '',
    );
    await checkLinksInHtml(
      '<a href="/non-existent">Link</a>',
      brokenLinksMap, '/page-two/', '/page-two/index.html',
      checkedLinks, distPath, {}, logger, false, 'ignore', null, '',
    );

    expect(brokenLinksMap.has('/non-existent')).toBe(true);
    const docs = Array.from(brokenLinksMap.get('/non-existent'));
    expect(docs).toHaveLength(2);
  });
});

describe('base path with redirects', () => {
  it('strips base prefix before redirect lookup', async () => {
    const map = await getBrokenLinks(
      '<a href="/docs/redirected">Link</a>',
      { base: '/docs', redirects: { '/redirected': '/about' } }
    );
    expect(map.has('/docs/redirected')).toBe(false);
  });
});

describe('isValidUrl filtering', () => {
  it('skips mailto:, tel:, javascript:, #anchor, and empty links', async () => {
    const html = [
      '<a href="mailto:user@example.com">Email</a>',
      '<a href="tel:+1234567890">Call</a>',
      '<a href="javascript:void(0)">JS</a>',
      '<a href="#section">Anchor</a>',
      '<a href="">Empty</a>',
      '<a href="/non-existent">Broken</a>',
    ].join('');
    const map = await getBrokenLinks(html);
    // Only the actual broken internal link should be flagged
    expect(map.size).toBe(1);
    expect(map.has('/non-existent')).toBe(true);
  });
});

describe('external link cache round-trip', () => {
  it('saves and loads cache correctly', () => {
    const tmpFile = path.join(os.tmpdir(), `test-cache-${Date.now()}.tsv`);
    const cache = new Map();
    cache.set('https://example.com', { status: 'ok', statusCode: 200, timestamp: '2026-01-01T00:00:00Z' });
    cache.set('https://broken.com', { status: 'error', statusCode: 404, timestamp: '2026-01-01T00:00:00Z' });

    saveExternalLinkCache(tmpFile, cache);
    const loaded = loadExternalLinkCache(tmpFile);

    // Only 'ok' entries are saved and loaded
    expect(loaded.size).toBe(1);
    expect(loaded.has('https://example.com')).toBe(true);
    expect(loaded.has('https://broken.com')).toBe(false);

    fs.unlinkSync(tmpFile);
  });

  it('returns empty Map for non-existent file', () => {
    const loaded = loadExternalLinkCache('/tmp/does-not-exist-' + Date.now() + '.tsv');
    expect(loaded.size).toBe(0);
  });
});

describe('normalizeHtmlFilePath', () => {
  it('strips distPath and normalizes', () => {
    expect(normalizeHtmlFilePath('/dist/about/index.html', '/dist')).toBe('/about/');
    expect(normalizeHtmlFilePath('/dist/page.html', '/dist')).toBe('/page');
    // Root index.html normalizes to /index (normalizePath only strips /index.html suffix)
    expect(normalizeHtmlFilePath('/dist/index.html', '/dist')).toBe('/index');
  });
});
