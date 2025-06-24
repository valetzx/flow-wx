const cheerioMod = typeof process !== 'undefined' && process.versions?.node
  ? await import('cheerio')
  : await import('npm:cheerio@1.0.0-rc.12');
const cheerio = cheerioMod.default || cheerioMod;

import { randomSentence } from './articleUtils.js';

export async function fetchWxTitle(url, fetchFn = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetchFn(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal });
    const html = await res.text();
    const $ = cheerio.load(html, { decodeEntities: false });
    const t = $('#activity-name').text().trim() || $('.rich_media_title').text().trim();
    return t || randomSentence();
  } catch {
    return randomSentence();
  } finally {
    clearTimeout(timer);
  }
}

export async function scrapeWx(article, fetchFn = fetch) {
  const { url } = article;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetchFn(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal });
    const html = await res.text();
    const $ = cheerio.load(html, { decodeEntities: false });
    const name = article.title || $('#activity-name').text().trim() || $('.rich_media_title').text().trim() || randomSentence();
    const time = article.date || $('#publish_time').text().trim() || $('meta[property="article:published_time"]').attr('content');
    const description = article.describe || $('meta[property="og:description"]').attr('content') || $('#js_content p').first().text().trim();
    const images = [];
    $('#js_content img').each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src');
      if (src) images.push(src.split('?')[0]);
    });
    const jsonWxRaw = $('catch#json-wx').html()?.trim();
    let jsonWx;
    if (jsonWxRaw) {
      try { jsonWx = JSON.parse(jsonWxRaw.replace(/&quot;/g, '"')); }
      catch (e) { jsonWx = { parseError: e.message, raw: jsonWxRaw }; }
    }
    return { [name]: { time, description, images, jsonWx, url, tags: article.tags, abbrlink: article.abbrlink, date: article.date } };
  } finally {
    clearTimeout(timer);
  }
}
