const cheerioMod = typeof process !== 'undefined' && process.versions?.node
const cheerio = cheerioMod.default || cheerioMod;

import { randomSentence } from './articleUtils.js';

export async function fetchBiliTitle(url, fetchFn = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetchFn(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal });
    const html = await res.text();
    const $ = cheerio.load(html, { decodeEntities: false });
    const t = $('.opus-module-title__text').first().text().trim();
    return t || randomSentence();
  } catch {
    return randomSentence();
  } finally {
    clearTimeout(timer);
  }
}

export async function scrapeBili(article, fetchFn = fetch) {
  const { url } = article;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetchFn(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal });
    const html = await res.text();
    const $ = cheerio.load(html, { decodeEntities: false });
    const name = article.title || $('.opus-module-title__text').first().text().trim() || randomSentence();
    const description = article.describe || $('meta[name="description"]').attr('content') || $('.opus-module-content').text().trim().slice(0, 80);
    const images = [];
    $('.opus-module-content img').each((_, el) => {
      const src = $(el).attr('src');
      if (src) images.push(src.startsWith('//') ? `https:${src}` : src);
    });
    const content = $('.opus-module-content').first().text().trim();
    return { [name]: { description, images, content, url, tags: article.tags, abbrlink: article.abbrlink, date: article.date } };
  } finally {
    clearTimeout(timer);
  }
}
