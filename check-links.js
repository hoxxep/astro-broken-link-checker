import { parse } from 'node-html-parser';
import fs from 'fs';
import fetch from 'node-fetch';
import { URL, fileURLToPath } from 'url';
import path from 'path';
import pLimit from 'p-limit';

export async function checkLinksInHtml(
  htmlContent,
  brokenLinksMap,
  baseUrl,
  documentPath,
  checkedLinks = new Map(),
  distPath = ''
) {
  const root = parse(htmlContent);
  const linkElements = root.querySelectorAll('a[href]');
  const links = linkElements.map((el) => el.getAttribute('href'));

  const limit = pLimit(10); // Limit to 10 concurrent link checks

  const checkLinkPromises = links.map((link) =>
    limit(async () => {
      if (!isValidUrl(link)) {
        return;
      }

      let absoluteLink;
      try {
        
        // Differentiate between absolute, domain-relative, and relative links
        if (/^https?:\/\//i.test(link) || /^:\/\//i.test(link)) {
          // Absolute URL
          absoluteLink = link;
        } else {
          absoluteLink = new URL(link, "https://localhost" + baseUrl).pathname;
          if (link !== absoluteLink) {
            console.log('Link', link, 'was converted to', absoluteLink);
          }
        }
      } catch (err) {
        // Invalid URL, skip
        console.log('Invalid URL in', normalizePath(documentPath), link, err);
        return;
      }

      if (checkedLinks.has(absoluteLink)) {
        const isBroken = !checkedLinks.get(absoluteLink);
        if (isBroken) {
          addBrokenLink(brokenLinksMap, documentPath, link, distPath);
        }
        return;
      }

      let isBroken = false;

      if (absoluteLink.startsWith('/') && distPath) {
        // Internal link in build mode, check if file exists
        const relativePath = absoluteLink;
        // Potential file paths to check
        const possiblePaths = [
          path.join(distPath, relativePath),
          path.join(distPath, relativePath, 'index.html'),
          path.join(distPath, `${relativePath}.html`),
        ];

        // Check if any of the possible paths exist
        if (!possiblePaths.some((p) => fs.existsSync(p))) {
          // console.log('Failed paths', possiblePaths);
          isBroken = true;
        }
      } else  {
        // External link, check via HTTP request
        try {
          const response = await fetch(link, { method: 'GET' });
          isBroken = !response.ok;
          if (isBroken) {
            console.log( response.status, ' Error fetching', link);
          }
        } catch (error) {
          isBroken = true;
          console.log( error.errno, 'error fetching', link);
        }
      }

      // Cache the link's validity
      checkedLinks.set(absoluteLink, !isBroken);

      if (isBroken) {
        addBrokenLink(brokenLinksMap, documentPath, link, distPath);
      }
    })
  );

  await Promise.all(checkLinkPromises);
}

function isValidUrl(url) {
  // Skip mailto:, tel:, javascript:, and empty links
  if (
    url.startsWith('mailto:') ||
    url.startsWith('tel:') ||
    url.startsWith('javascript:') ||
    url.startsWith('#') ||
    url.trim() === ''
  ) {
    return false;
  }
  return true;
}

function normalizePath(p) {
  p = p.toString();
  // Remove query parameters and fragments
  p = p.split('?')[0].split('#')[0];

  // Remove '/index.html' or '.html' suffixes
  if (p.endsWith('/index.html')) {
    p = p.slice(0, -'index.html'.length);
  } else if (p.endsWith('.html')) {
    p = p.slice(0, -'.html'.length);
  }

  // Ensure leading '/'
  if (!p.startsWith('/')) {
    p = '/' + p;
  }

  return p;
}

export function normalizeHtmlFilePath(filePath, distPath = '') {
  return normalizePath(distPath ? path.relative(distPath, filePath) : filePath);
}

function addBrokenLink(brokenLinksMap, documentPath, brokenLink, distPath) {
  // Normalize document path
  documentPath = normalizeHtmlFilePath(documentPath, distPath);

  // Normalize broken link for reporting
  let normalizedBrokenLink = brokenLink;


  if (!brokenLinksMap.has(normalizedBrokenLink)) {
    brokenLinksMap.set(normalizedBrokenLink, new Set());
  }
  brokenLinksMap.get(normalizedBrokenLink).add(documentPath);
}