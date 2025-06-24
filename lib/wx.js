import { randomSentence } from './articleUtils.js';
import * as cheerio from 'cheerio';

export async function fetchWxTitle(url, fetchFn = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetchFn(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://mp.weixin.qq.com/',
      },
      signal: controller.signal,
    });
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
    const res = await fetchFn(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://mp.weixin.qq.com/',
      },
      signal: controller.signal,
    });
    const html = await res.text();
    const $ = cheerio.load(html, { decodeEntities: false });
    const name = article.title || $('#activity-name').text().trim() || $('.rich_media_title').text().trim() || randomSentence();
    const time = article.date || $('#publish_time').text().trim() || $('meta[property="article:published_time"]').attr('content');
    const description = article.describe || $('meta[property="og:description"]').attr('content') || $('#js_content p').first().text().trim();
    const imageSet = new Set();
    $('#js_content img').each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src');
      if (src) imageSet.add(src.split('?')[0]);
    });
    $('[style]').each((_, el) => {
      const style = $(el).attr('style') ?? '';
      style.replace(/url\((['"]?)(https?:\/\/[^'"\)]+)\1\)/g, (_m, _q, url) => {
        if (url.includes('mmbiz')) {
          imageSet.add(url.replace(/&amp;/g, '&').split('?')[0]);
        }
        return '';
      });
    });
    let images = Array.from(imageSet);
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
