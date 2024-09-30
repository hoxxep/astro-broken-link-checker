import { fileURLToPath } from 'url';
import { join } from 'path';
import fs from 'fs';
import { checkLinksInHtml , normalizeHtmlFilePath } from './check-links.js';
import fastGlob from 'fast-glob';

export default function astroBrokenLinksChecker(options = {}) {
  const logFilePath = options.logFilePath || 'broken-links.log';
  const brokenLinksMap = new Map(); // Map of brokenLink -> Set of documents
  const checkedLinks = new Map();

  return {
    name: 'astro-broken-links-checker',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const distPath = fileURLToPath(dir);
        const htmlFiles = await fastGlob('**/*.html', { cwd: distPath });
        console.log(`Checking ${htmlFiles.length} html pages for broken links`);
        const checkHtmlPromises = htmlFiles.map(async (htmlFile) => {
          const absoluteHtmlFilePath = join(distPath, htmlFile);
          const htmlContent = fs.readFileSync(absoluteHtmlFilePath, 'utf8');
          const baseUrl = normalizeHtmlFilePath(absoluteHtmlFilePath, distPath);
          await checkLinksInHtml(
            htmlContent,
            brokenLinksMap,
            baseUrl,
            absoluteHtmlFilePath, // Document path
            checkedLinks,
            distPath
          );
        });
        await Promise.all(checkHtmlPromises);
        logBrokenLinks(brokenLinksMap, logFilePath);
      },
    },
  };
}

function logBrokenLinks(brokenLinksMap, logFilePath) {
  if (brokenLinksMap.size > 0) {
    let logData = '';
    for (const [brokenLink, documentsSet] of brokenLinksMap.entries()) {
      const documents = Array.from(documentsSet);
      logData += `Broken link: ${brokenLink}\n  Found in:\n`;
      for (const doc of documents) {
        logData += `    - ${doc}\n`;
      }
    }
    logData = logData.trim();
    if (logFilePath) {
      fs.writeFileSync(logFilePath, logData, 'utf8');
      console.log(`Broken links have been logged to ${logFilePath}`);
      console.log(logData);
    } else {
      console.log(logData);
    }
  } else {
    console.log('No broken links detected.');
  }
}