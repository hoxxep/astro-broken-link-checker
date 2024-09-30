import { defineConfig } from 'astro/config';
import astroBrokenLinksChecker from 'astro-broken-links-checker';

export default defineConfig({
  integrations: [astroBrokenLinksChecker({
    logFilePath: 'broken-links.log',
  })],
});