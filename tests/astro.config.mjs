import { defineConfig } from 'astro/config';
import astroBrokenLinksChecker from 'astro-broken-links-checker';

export default defineConfig({
  trailingSlash: 'never',
  redirects: {
    '/redirected': '/about',
  },
  integrations: [astroBrokenLinksChecker({
    logFilePath: 'broken-links.log',
  })],
});
