# Astro Broken Links Checker

An Astro integration that checks for broken links in your website during static builds. It validates internal links (and optionally external ones), logging any broken links to both the console and a file.

## Installation

```bash
npm install astro-broken-links-checker
```

Then add it to your `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import astroBrokenLinksChecker from 'astro-broken-links-checker';

export default defineConfig({
  integrations: [
    astroBrokenLinksChecker({
      checkExternalLinks: true, // default: false
      throwError: true,         // default: false
    }),
  ],
});
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `checkExternalLinks` | `boolean` | `false` | Also check external (http/https) links via HTTP requests. |
| `cacheExternalLinks` | `boolean` | `true` | Cache verified external links to disk to speed up subsequent builds. |
| `throwError` | `boolean` | `false` | Fail the build if any broken links are found. |
| `linkCheckerDir` | `string` | `'.link-checker'` | Directory for cache and log files. |

## Features

- **Checks `<a href>` and `<img src>`** references in all built HTML pages.
- **Deduplication**: Each unique link is checked only once across all pages.
- **Parallel processing**: Pages (up to 50 concurrent) and HTTP requests (up to 10 concurrent) run in parallel.
- **Base path support**: Respects Astro's `base` config, stripping the prefix before checking file existence.
- **Redirect awareness**: Follows redirects defined in `astro.config.mjs`.
- **Trailing slash enforcement**: Respects Astro's `trailingSlash` setting and flags links that violate it.
- **Timeouts and retries**: External link checks have a 3-second timeout. ECONNRESET and timeout failures are retried up to 3 times with exponential backoff.
- **Disk caching**: Verified external links are cached to `.link-checker/verified-external-links.tsv`. Commit this file to skip re-checking on CI.

## Output

The integration creates a `.link-checker` directory containing:

- **`verified-external-links.tsv`** — Cache of verified external links (TSV: URL, status, statusCode, timestamp). **Commit this to git** to avoid re-checking on CI.
- **`broken-links.log`** — Broken links found during the build (gitignored automatically).

## Compatibility

- **Node.js**: 18+
- **Astro**: 4.x and 5.x

## License

[Apache-2.0](LICENSE)
