# Astro Broken Links Checker

An Astro integration that checks for broken links in your website during static build. It logs any broken links to the console and writes them to a file, grouping them by the document in which they occur.

## Features

- **Checks Internal and External Links**: Validates all `<a href="...">` links found in your HTML pages.
- **Logs Broken Links**: Outputs broken link information to both the console and a log file.
- **Grouped by Document**: Broken links are grouped by the document in which they occur, making it easier to identify and fix issues.
- **Caching Mechanism**: Avoids redundant checks by caching the results of previously checked links.
- **Parallel Processing**: Checks links in parallel to improve performance.
- **Development Mode Middleware**: Checks links on each page load during development.
- **Post-Build Validation**: Scans all generated HTML files after building your site.

## Installation

Install the package and its peer dependencies:

```bash
npm install astro-broken-links-checker
```
```js
import { defineConfig } from 'astro/config';
import astroBrokenLinksChecker from 'astro-broken-links-checker';

export default defineConfig({
  // ... other configurations ...
  integrations: [
    astroBrokenLinksChecker({
      logFilePath: 'broken-links.log', // Optional: specify the log file path
    }),
  ],
});
```