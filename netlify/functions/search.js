const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

function parseIMDb(html) {
  const list = [];
  const regex = /<a\s+href="(\/title\/tt\d+\/[^"]*)".*?>([^<]+)<\/a>/gi;
  let m;
  const seen = new Set();
  while ((m = regex.exec(html)) && list.length < 10) {
    const href = m[1];
    const title = m[2].trim();
    if (!seen.has(href)) {
      seen.add(href);
      const idMatch = href.match(/tt\d+/);
      list.push({ source: 'imdb', imdb: idMatch ? idMatch[0] : null, title, link: 'https://www.imdb.com' + href });
    }
  }
  return list;
}

function parseTMDB(html) {
  const list = [];
  const regex = /<a\s+href="(\/(movie|tv)\/\d+)[^"]*".*?>([^<]+)<\/a>/gi;
  let m; const seen = new Set();
  while ((m = regex.exec(html)) && list.length < 10) {
    const href = m[1];
    const title = m[3].trim();
    if (!seen.has(href)) {
      seen.add(href);
      const idMatch = href.match(/\/(movie|tv)\/(\d+)/);
      list.push({ source: 'tmdb', tmdb: idMatch ? idMatch[2] : null, title, link: 'https://www.themoviedb.org' + href });
    }
  }
  return list;
}

function parseKinopoisk(html) {
  const list = [];
  const regex = /\/film\/(\d+)\/[^"]*"/gi;
  let m; const seen = new Set();
  while ((m = regex.exec(html)) && list.length < 10) {
    const id = m[1];
    if (!seen.has(id)) {
      seen.add(id);
      list.push({ source: 'kp', kp: id, title: null, link: 'https://www.kinopoisk.ru/film/' + id + '/' });
    }
  }
  const tregex = /<a[^>]*class="(?:styles_link__[^"]*|name|.*?film-name).*?">([^<]+)<\/a>/gi;
  let ti = 0;
  while ((m = tregex.exec(html)) && ti < list.length) {
    const t = m[1].trim();
    if (t) { list[ti].title = list[ti].title || t; ti++; }
  }
  return list;
}

function parseLetterboxd(html) {
  const list = [];
  const regex = /<a\s+href="(\/film\/[^"\/]+\/)".*?>([^<]+)<\/a>/gi;
  let m; const seen = new Set();
  while ((m = regex.exec(html)) && list.length < 10) {
    const href = m[1];
    const title = m[2].trim();
    if (!seen.has(href)) {
      seen.add(href);
      list.push({ source: 'lb', title, link: 'https://letterboxd.com' + href });
    }
  }
  return list;
}

exports.handler = async function(event) {
  const q = (event.queryStringParameters && event.queryStringParameters.q) || '';
  const source = (event.queryStringParameters && event.queryStringParameters.source) || 'all';
  if (!q) return { statusCode: 400, body: JSON.stringify({ error: 'q required' }) };

  const headers = {
    'User-Agent': 'nxmedia-scraper/1.0 (+https://nxmedia.uz)'
  };

  const tasks = [];

  if (source === 'imdb' || source === 'all') {
    tasks.push((async () => {
      try {
        const url = 'https://www.imdb.com/find?q=' + encodeURIComponent(q);
        const r = await fetch(url, { headers });
        const text = await r.text();
        return parseIMDb(text);
      } catch(e) { return []; }
    })());
  }

  if (source === 'tmdb' || source === 'all') {
    tasks.push((async () => {
      try {
        const url = 'https://www.themoviedb.org/search?query=' + encodeURIComponent(q);
        const r = await fetch(url, { headers });
        const text = await r.text();
        return parseTMDB(text);
      } catch(e) { return []; }
    })());
  }

  if (source === 'kp' || source === 'all') {
    tasks.push((async () => {
      try {
        const url = 'https://www.kinopoisk.ru/index.php?kp_query=' + encodeURIComponent(q);
        const r = await fetch(url, { headers });
        const text = await r.text();
        return parseKinopoisk(text);
      } catch(e) { return []; }
    })());
  }

  if (source === 'lb' || source === 'all') {
    tasks.push((async () => {
      try {
        const url = 'https://letterboxd.com/search/films/' + encodeURIComponent(q) + '/';
        const r = await fetch(url, { headers });
        const text = await r.text();
        return parseLetterboxd(text);
      } catch(e) { return []; }
    })());
  }

  try {
    const resultsArrays = await Promise.all(tasks);
    const merged = [];
    const seen = new Set();
    for (const arr of resultsArrays) {
      for (const item of arr) {
        const key = item.link || (item.imdb||item.kp||item.tmdb||item.title);
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
    }
    return { statusCode: 200, body: JSON.stringify(merged) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};
