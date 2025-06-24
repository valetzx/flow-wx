export async function scrapeBil(article, cheerio, randomSentence) {
  const { url } = article;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
    const html = await res.text();
    const $ = cheerio.load(html, { decodeEntities: false });
    const name =
      article.title ||
      $(".opus-module-title__text").first().text().trim() ||
      randomSentence();
    const description =
      article.describe ||
      $(".opus-module-content").first().text().trim();
    const images = [];
    $(".opus-module-content img").each((_, el) => {
      const src = $(el).attr("src");
      if (src) images.push(src.startsWith("//") ? `https:${src}` : src);
    });
    return {
      [name]: {
        description,
        images,
        url,
        tags: article.tags,
        abbrlink: article.abbrlink,
        date: article.date,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
