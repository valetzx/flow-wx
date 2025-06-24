import { randomSentence } from './articleUtils.js';
import * as cheerio from 'cheerio';

async function fetchHtml(url, fetchFn) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const headers = { 'User-Agent': 'Mozilla/5.0' };
  try {
    let res;
    try {
      res = await fetchFn(url, { headers, signal: controller.signal });
      if (res.ok) return await res.text();
    } catch {}

    // fall back to jina.ai proxy which mirrors public WeChat pages
    const proxyUrl = `https://r.jina.ai/${url}`;
    res = await fetchFn(proxyUrl, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWxTitle(url, fetchFn = fetch) {
  try {
    const html = await fetchHtml(url, fetchFn);
    const $ = cheerio.load(html, { decodeEntities: false });
    const t = $('#activity-name').text().trim() || $('.rich_media_title').text().trim();
    return t || randomSentence();
  } catch {
    return randomSentence();
  }
}

export async function scrapeWx(article, fetchFn = fetch) {
  const { url } = article;
  const html = await fetchHtml(url, fetchFn);
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
}
