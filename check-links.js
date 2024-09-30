// check-links.js

import { parse } from 'node-html-parser';
import fs from 'fs';
import fetch from 'node-fetch';
import { URL, fileURLToPath } from 'url';
import pLimit from 'p-limit';

export default async function checkLinksInHtml(
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
      const absoluteLink = new URL(link, baseUrl).href;

      if (checkedLinks.has(absoluteLink)) {
        const isBroken = !checkedLinks.get(absoluteLink);
        if (isBroken) {
          addBrokenLink(brokenLinksMap, documentPath, absoluteLink);
        }
        return;
      }

      let isBroken = false;

      if (absoluteLink.startsWith('file://') && distPath) {
        // Internal link in build mode, check if file exists
        const filePath = fileURLToPath(absoluteLink);
        if (!fs.existsSync(filePath)) {
          isBroken = true;
        }
      } else {
        try {
          const response = await fetch(absoluteLink, { method: 'HEAD' });
          isBroken = !response.ok;
        } catch (error) {
          isBroken = true;
        }
      }

      checkedLinks.set(absoluteLink, !isBroken);

      if (isBroken) {
        addBrokenLink(brokenLinksMap, documentPath, absoluteLink);
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
  // Remove any query parameters or hash fragments
  p = p.split('?')[0].split('#')[0];

  // Ensure leading '/'
  if (!p.startsWith('/')) {
    p = '/' + p;
  }
  // Remove '/index.html' at the end
  if (p.endsWith('/index.html')) {
    p = p.slice(0, -'/index.html'.length);
    if (p === '') {
      p = '/';
    }
  }
  return p;
}

function addBrokenLink(brokenLinksMap, documentPath, brokenLink) {
  // Normalize document path
  documentPath = normalizePath(documentPath);

  let normalizedBrokenLink;

  try {
    const url = new URL(brokenLink);
    if (url.protocol === 'file:') {
      // Internal link, normalize the path
      normalizedBrokenLink = normalizePath(url.pathname);
    } else {
      // External link, keep the origin and pathname
      normalizedBrokenLink = url.origin + normalizePath(url.pathname);
    }
  } catch (err) {
    // Not a valid URL, treat as path
    normalizedBrokenLink = normalizePath(brokenLink);
  }

  if (!brokenLinksMap.has(normalizedBrokenLink)) {
    brokenLinksMap.set(normalizedBrokenLink, new Set());
  }
  brokenLinksMap.get(normalizedBrokenLink).add(documentPath);

  // Optional: Log when a broken link is added
  // console.log(`Added broken link: ${normalizedBrokenLink} in document ${documentPath}`);
}
