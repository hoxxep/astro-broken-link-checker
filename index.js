// index.js

import { fileURLToPath } from 'url';
import { join } from 'path';
import fs from 'fs';
import checkLinksInHtml from './check-links.js';
import fastGlob from 'fast-glob';

export default function astroBrokenLinksChecker(options = {}) {
  const logFilePath = options.logFilePath || 'broken-links.log';
  const brokenLinksByDocument = new Map();
  const checkedLinks = new Map();

  return {
    name: 'astro-broken-links-checker',
    hooks: {
      'astro:server:setup': async ({ server }) => {
        server.middlewares.use(async (req, res, next) => {
          const originalEnd = res.end;
          const chunks = [];

          res.write = function (chunk) {
            chunks.push(Buffer.from(chunk));
            return res.write.apply(res, arguments);
          };

          res.end = async function (chunk) {
            if (chunk) chunks.push(Buffer.from(chunk));

            const body = Buffer.concat(chunks).toString('utf8');
            if (res.getHeader('Content-Type')?.includes('text/html')) {
              const baseUrl = `http://${req.headers.host}${req.url}`;
              await checkLinksInHtml(
                body,
                brokenLinksByDocument,
                baseUrl,
                req.url, // Pass the document path (URL)
                checkedLinks
              );
            }

            originalEnd.apply(res, arguments);
          };

          next();
        });
      },
      'astro:build:done': async ({ dir }) => {
        const distPath = fileURLToPath(dir);
        const htmlFiles = await fastGlob('**/*.html', { cwd: distPath });
        const checkHtmlPromises = htmlFiles.map(async (htmlFile) => {
          const htmlContent = fs.readFileSync(join(distPath, htmlFile), 'utf8');
          const baseUrl = 'file://' + join(distPath, htmlFile);
          await checkLinksInHtml(
            htmlContent,
            brokenLinksByDocument,
            baseUrl,
            htmlFile, // Pass the document path (file path)
            checkedLinks,
            distPath
          );
        });
        await Promise.all(checkHtmlPromises);
        logBrokenLinks(brokenLinksByDocument, logFilePath);
      },
    },
  };
}

function logBrokenLinks(brokenLinksMap, logFilePath) {
  if (brokenLinksMap.size > 0) {
    let logData = '';
    for (const [document, links] of brokenLinksMap.entries()) {
      logData += `\nIn ${document}:\n`;
      for (const linkInfo of links) {
        logData += `  - ${linkInfo}\n`;
      }
    }
    fs.writeFileSync(logFilePath, logData.trim(), 'utf8');
    console.log(`Broken links have been logged to ${logFilePath}`);
  } else {
    console.log('No broken links detected.');
  }
}
