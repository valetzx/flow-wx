export const fallbackSentences = [
  '小荷才露尖尖角',
  '早有蜻蜓立上头',
  '采菊东篱下',
  '悠然见南山',
  '看看内容吧',
  '日长篱落无人过',
  '惟有蜻蜓蛱蝶飞',
  '小娃撑小艇',
  '日长篱落无人过',
  '惟有蜻蜓蛱蝶飞',
  '偷采白莲回',
  '不解藏踪迹',
  '浮萍一道开'
];

export function randomSentence() {
  return fallbackSentences[Math.floor(Math.random() * fallbackSentences.length)];
}

export function parseArticles(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('---')) {
    return trimmed
      .split(/\r?\n/)
      .map((l) => ({ url: l.trim() }))
      .filter((a) => a.url);
  }
  const parts = trimmed.split(/^---\s*$/m).map((p) => p.trim()).filter(Boolean);
  const arr = [];
  for (const part of parts) {
    const lines = part.split(/\r?\n/);
    const meta = {};
    let current = null;
    for (const line of lines) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (kv) {
        current = kv[1];
        const value = kv[2];
        if (value === '') {
          if (current === 'tags') meta[current] = [];
          else meta[current] = '';
        } else {
          meta[current] = value;
        }
        continue;
      }
      const m = line.match(/^\s*-\s*(.+)$/);
      if (m && current) {
        if (!Array.isArray(meta[current])) meta[current] = [];
        meta[current].push(m[1]);
      }
    }
    if (meta.url) arr.push(meta);
  }
  return arr;
}
