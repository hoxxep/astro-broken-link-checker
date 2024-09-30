// index.js

import { fileURLToPath } from 'url';
import { join } from 'path';
import fs from 'fs';
import checkLinksInHtml from './check-links.js';
import fastGlob from 'fast-glob';

export default function astroBrokenLinksChecker(options = {}) {
  const logFilePath = options.logFilePath || 'broken-links.log';
  const brokenLinksMap = new Map(); // Map of brokenLink -> Set of documents
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
                brokenLinksMap,
                baseUrl,
                req.url, // Document path
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
        // Log we are checking (x) pages for broken links
        console.log(`Checking ${htmlFiles.length} html pages for broken links`);
        const checkHtmlPromises = htmlFiles.map(async (htmlFile) => {
          const htmlContent = fs.readFileSync(join(distPath, htmlFile), 'utf8');
          const baseUrl = 'file://' + join(distPath, htmlFile);
          await checkLinksInHtml(
            htmlContent,
            brokenLinksMap,
            baseUrl,
            htmlFile, // Document path
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
