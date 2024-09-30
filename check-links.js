// check-links.js

import { parse } from 'node-html-parser';
import fs from 'fs';
import fetch from 'node-fetch';
import { URL } from 'url';
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
        if (!checkedLinks.get(absoluteLink)) {
          addBrokenLink(brokenLinksMap, documentPath, `${absoluteLink} - previously detected as broken`);
          console.error(`Broken link detected in ${documentPath}: ${absoluteLink} - previously detected as broken`);
        }
        return;
      }

      if (absoluteLink.startsWith('file://') && distPath) {
        // Internal link in build mode, check if file exists
        const filePath = absoluteLink.replace('file://', '');
        if (!fs.existsSync(filePath)) {
          addBrokenLink(brokenLinksMap, documentPath, `${link} - File does not exist`);
          checkedLinks.set(absoluteLink, false);
          console.error(`Broken link detected in ${documentPath}: ${link} - File does not exist`);
        } else {
          checkedLinks.set(absoluteLink, true);
        }
      } else {
        try {
          const response = await fetch(absoluteLink, { method: 'HEAD' });
          const isOk = response.ok;
          checkedLinks.set(absoluteLink, isOk);
          if (!isOk) {
            addBrokenLink(brokenLinksMap, documentPath, `${link} - ${response.status} ${response.statusText}`);
            console.error(`Broken link detected in ${documentPath}: ${link} - ${response.status} ${response.statusText}`);
          }
        } catch (error) {
          checkedLinks.set(absoluteLink, false);
          addBrokenLink(brokenLinksMap, documentPath, `${link} - ${error.message}`);
          console.error(`Error checking link in ${documentPath}: ${link} - ${error.message}`);
        }
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

function addBrokenLink(brokenLinksMap, documentPath, linkInfo) {
  if (!brokenLinksMap.has(documentPath)) {
    brokenLinksMap.set(documentPath, []);
  }
  brokenLinksMap.get(documentPath).push(linkInfo);
}
