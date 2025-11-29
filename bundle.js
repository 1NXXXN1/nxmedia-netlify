// FULL bundle.js - reconstructed Kinobox + KP integration
// core/http
const TIMEOUT = 10000;
const MAX_RETRY = 3;
const inflight = new Map();
function withTimeout(promise, ms = TIMEOUT) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("HTTP_TIMEOUT")), ms))]);
}
async function doFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error("HTTP_STATUS_" + res.status);
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}
async function http(url, opts = {}, retry = 0) {
  const key = url + JSON.stringify(opts);
  if (inflight.has(key)) return inflight.get(key);
  const exec = (async () => {
    try {
      return await withTimeout(doFetch(url, opts));
    } catch (err) {
      if (retry < MAX_RETRY) {
        await new Promise(r => setTimeout(r, 200 * (retry + 1)));
        return http(url, opts, retry + 1);
      }
      throw err;
    }
  })();
  inflight.set(key, exec);
  exec.finally(() => inflight.delete(key));
  return exec;
}

// core/cache
class Cache {
  constructor(ttl = 60000, max = 200) { this.ttl = ttl; this.max = max; this.map = new Map(); }
  _isExpired(entry) { return Date.now() - entry.time > this.ttl; }
  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (this._isExpired(entry)) { this.map.delete(key); return null; }
    this.map.delete(key); this.map.set(key, entry); return entry.value;
  }
  set(key, value) {
    if (this.map.size >= this.max) { const firstKey = this.map.keys().next().value; this.map.delete(firstKey); }
    this.map.set(key, { value, time: Date.now() });
  }
}
const globalCache = new Cache(60*1000, 500);

// kinobox/api
const KB_BASE = "https://api.kinobox.tv/api";
async function kbGet(path, params = {}) {
  const q = new URLSearchParams(params).toString();
  // Use Netlify proxy if available
  const proxy = (typeof location !== 'undefined' && location.hostname && location.hostname.endsWith('netlify.app')) ? '/kinobox' : null;
  if (proxy) {
    // forward path and params to /kinobox via query string
    const queryObj = Object.assign({}, params);
    const url = '/kinobox?path=' + encodeURIComponent(path) + (Object.keys(queryObj).length ? '&' + new URLSearchParams(queryObj).toString() : '');
    return http(url);
  }
  return http(KB_BASE + path + (q ? "?" + q : ""));
}
function kbGetMovie(id){ return kbGet(`/movies/${id}`); }
function kbGetPlayers(kinopoiskId){ return kbGet(`/players`, { kinopoisk: kinopoiskId }); }
function kbSearch(query){ return kbGet(`/movies/search/`, { query }); }
function kbPopular(page=1){ return kbGet(`/popular`, { page }); }
function kbSimilarByKBId(id){ return kbGet(`/similar/${id}`); }

// kinobox/normalize
const g = (o,k,d=null)=> o && o[k] !== undefined ? o[k] : d;
function normalizeTitle(obj){
  if(!obj) return "";
  if(typeof obj === "string") return obj;
  return g(obj,"russian")||g(obj,"russianName")||g(obj,"name")||g(obj,"title")||g(obj,"original")||"";
}
function normalizeKBMovie(raw){
  if(!raw) return null;
  const title = normalizeTitle(raw.title || raw);
  return {
    id: raw.id || raw.movieId || raw.filmId || null,
    kpId: raw.kinopoiskId || raw.kinopoisk_id || raw.kp_id || null,
    imdbId: raw.imdb || raw.imdbId || null,
    title,
    originalTitle: raw.originalTitle || raw.orig_title || null,
    year: raw.year || null,
    description: raw.description || raw.desc || null,
    poster: raw.poster || raw.posterPreview || raw.poster_url || raw.cover || null,
    countries: raw.countries || [],
    genres: raw.genres || [],
    rating: { kp: g(raw,"rating_kp"), imdb: g(raw,"rating_imdb"), kinobox: g(raw,"rating") },
    isSeries: raw.isSeries || raw.type === "series" || false,
    raw
  };
}
function normalizeSearchList(raw){
  let items=[];
  if(Array.isArray(raw)) items=raw;
  else if(raw && raw.data && Array.isArray(raw.data.items)) items=raw.data.items;
  else if(raw && raw.items) items=raw.items;
  else if(raw && raw.results) items=raw.results;
  return items.map(normalizeKBMovie);
}
function normalizePlayers(raw){
  const list = raw && (raw.playlist || raw.data || raw.players) || raw;
  if(!Array.isArray(list)) return [];
  return list.map(p=>({
    id: p.id||null,
    name: p.name||p.title||"Player",
    iframe: p.iframe||p.src||p.url||p.file||null,
    quality: p.quality||null,
    translator: p.translator||null,
    provider: p.provider||p.host||null,
    raw: p
  }));
}
function normalizeEpisodes(raw){
  if(!raw) return [];
  if(raw.seasons) return raw.seasons;
  if(raw.data && raw.data.seasons) return raw.data.seasons;
  return raw;
}
function normalizeSimilar(raw){
  const items = raw && (raw.items || raw.data && raw.data.items || raw.similar) || [];
  return (Array.isArray(items) ? items : []).map(normalizeKBMovie);
}

// kp/api (via Netlify proxy /kp)
function kpProxyPath(path, extraQuery=""){
  return '/kp?path=' + encodeURIComponent(path) + (extraQuery ? '&' + extraQuery : '');
}
async function kpSearch(query){
  return http(kpProxyPath("v2.1/films/search-by-keyword", "keyword=" + encodeURIComponent(query)));
}
async function kpGetMovie(id){
  return http(kpProxyPath("v2.2/films/" + encodeURIComponent(id)));
}
async function kpGetSimilar(kpId){
  return http(kpProxyPath("v2.2/films/" + encodeURIComponent(kpId) + "/similars"));
}

// search/smart
async function smartSearch(query, opts={}) {
  if(!query || !String(query).trim()) return { source: "none", items: [] };
  const cacheKey = `smartSearch:${query}:${opts.page||1}:${opts.forceKB?1:0}`;
  const cached = globalCache.get(cacheKey);
  if(cached) return cached;
  if(!opts.forceKB){
    try {
      const kpRes = await kpSearch(query);
      if(kpRes && Array.isArray(kpRes.films) && kpRes.films.length){
        const items = kpRes.films.map(it => ({ source: "kp", kpId: it.filmId || it.id, title: it.nameRu || it.nameOriginal || it.name, poster: it.posterUrlPreview || it.posterUrl, year: it.year }));
        const out = { source: "kp", items: items.map(i => ({...i})) };
        globalCache.set(cacheKey, out);
        return out;
      }
    } catch(e){ console.warn("KP search failed:", e && e.message); }
  }
  try {
    const kbRes = await kbSearch(query);
    const items = normalizeSearchList(kbRes);
    const out = { source: "kb", items };
    globalCache.set(cacheKey, out);
    return out;
  } catch(e){
    console.error("KB search failed:", e && e.message);
    return { source: "none", items: [] };
  }
}

// movie/full
async function getFullMovie({ kpId=null, kbId=null, prefer="kp" } = {}) {
  if(!kpId && !kbId) throw new Error("getFullMovie requires kpId or kbId");
  const cacheKey = `fullMovie:${kpId||''}:${kbId||''}:${prefer}`;
  const cached = globalCache.get(cacheKey);
  if(cached) return cached;
  let kpData=null, kbData=null, players=[], episodes=null, similar=[];
  if(kpId){
    try { kpData = normalizeKPMovie(await kpGetMovie(kpId)); } catch(e){ console.warn("kpGetMovie failed", e && e.message); }
  }
  if(kbId){
    try { kbData = normalizeKBMovie(await kbGetMovie(kbId)); } catch(e){ console.warn("kbGetMovie failed", e && e.message); }
  }
  // players: prefer kbGetPlayers by kpId
  try {
    const rawPlayers = await kbGetPlayers(kpId || kbId);
    players = normalizePlayers(rawPlayers);
  } catch(e){ /* ignore */ }
  // episodes
  try {
    if(kbData && kbData.id){
      const rawE = await kbEpisodes(kbData.id);
      episodes = normalizeEpisodes(rawE);
    } else if(kpData && kpData.isSeries){
      try { const raw = await kpGetMovie(kpId); episodes = normalizeEpisodes(raw?.seasons || raw); } catch(e) {}
    }
  } catch(e){}
  // similar: use KP similars (kp API)
  try {
    if(kpId){
      const rawSim = await kpGetSimilar(kpId);
      similar = (rawSim && (rawSim.items || rawSim.similarFilms || rawSim)) || [];
      if(Array.isArray(similar)) similar = similar.map(normalizeKPMovie);
    } else if(kbData && kbData.id){
      const rawSim = await kbSimilarByKBId(kbData.id);
      similar = normalizeSimilar(rawSim);
    }
  } catch(e){ console.warn("similar fetch failed", e && e.message); }
  const merged = {
    id: kpData?.kpId || kbData?.id || kpId || kbId || null,
    title: kpData?.title || kbData?.title || kpData?.originalTitle || kbData?.originalTitle || null,
    originalTitle: kpData?.originalTitle || kbData?.originalTitle || null,
    year: kpData?.year || kbData?.year || null,
    description: kpData?.description || kbData?.description || null,
    poster: kpData?.poster || kbData?.poster || null,
    genres: (kpData?.genres && kpData.genres.length ? kpData.genres : kbData?.genres) || [],
    countries: (kpData?.countries && kpData.countries.length ? kpData.countries : kbData?.countries) || [],
    rating: Object.assign({}, kbData?.rating || {}, kpData?.rating || {}),
    players,
    episodes,
    similar,
    raw: { kpData, kbData }
  };
  const final = { sourcePrimary: kpData ? "kp" : (kbData ? "kb" : "unknown"), kpData, kbData, players, episodes, similar, merged };
  globalCache.set(cacheKey, final, 5*60*1000);
  return final;
}

// kp normalize (helpers)
function normalizeKPTitle(raw){ return raw?.nameRu || raw?.nameOriginal || raw?.nameEn || raw?.name || ""; }
function normalizeKPMovie(raw){
  if(!raw) return null;
  return {
    source: "kinopoisk",
    id: raw.filmId || raw.kinopoiskId || null,
    kpId: raw.filmId || raw.kinopoiskId || null,
    imdbId: raw.imdbId || null,
    title: normalizeKPTitle(raw),
    originalTitle: raw.nameOriginal || raw.nameEn || null,
    year: raw.year || null,
    description: raw.shortDescription || raw.description || null,
    poster: raw.posterUrl || raw.posterUrlPreview || null,
    genres: (raw.genres||[]).map(g => typeof g === 'string' ? g : g.genre || g.name).filter(Boolean),
    countries: raw.countries || [],
    rating: { kp: raw.rating || raw.ratingKinopoisk || null, imdb: raw.ratingImdb || null },
    isSeries: !!raw.serial || !!raw.isSeries,
    raw
  };
}

// player providers + resolver + controller
const Providers = [
  { key: "kodik", detect: url => !!url && url.includes("kodik"), priority: 1 },
  { key: "videocdn", detect: url => !!url && url.includes("videocdn"), priority: 2 },
  { key: "collaps", detect: url => !!url && url.includes("collaps"), priority: 3 },
  { key: "hdvb", detect: url => !!url && url.includes("hdvb"), priority: 4 },
  { key: "moonwalk", detect: url => !!url && url.includes("moonwalk"), priority: 5 },
  { key: "unknown", detect: _ => true, priority: 999 }
];
function detectProvider(url){ return Providers.find(p=>p.detect(url)) || Providers[Providers.length-1]; }
function testIframe(url, timeout=4000){
  return new Promise(resolve=>{
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = url;
    let done=false;
    const timer = setTimeout(()=>{ if(!done){ done=true; try{ iframe.remove(); }catch(e){} resolve(false); } }, timeout);
    iframe.onload = ()=>{ if(!done){ done=true; try{ iframe.remove(); }catch(e){} resolve(true); } };
    document.body.appendChild(iframe);
  });
}
async function resolveBestPlayer(players){
  if(!Array.isArray(players) || !players.length) return null;
  const sorted = players.map(p => ({...p, provider: detectProvider(p.iframe)})).sort((a,b)=>a.provider.priority - b.provider.priority);
  for(const p of sorted){
    try { if(p.iframe && await testIframe(p.iframe)) return p; } catch(e) {}
  }
  return null;
}
class PlayerController {
  constructor(players){ this.players = players || []; this.current = -1; this.listeners = { load: [], error: [], change: [] }; }
  on(event, fn){ if(this.listeners[event]) this.listeners[event].push(fn); }
  emit(event, data){ (this.listeners[event]||[]).forEach(fn=>{ try{ fn(data); }catch(e){} }); }
  async autoSelect(){ const best = await resolveBestPlayer(this.players); if(!best){ this.emit('error','No working iframe'); return; } const idx = this.players.findIndex(p=>p === best); this.load(idx); }
  load(index){ if(index<0||index>=this.players.length) return; this.current = index; const p = this.players[index]; this.emit('change',p); const old = document.getElementById('player-iframe'); if(old) old.remove(); const el = document.createElement('iframe'); el.id='player-iframe'; el.src = p.iframe; el.allowFullscreen = true; el.onload = ()=> this.emit('load', p); document.getElementById('player').appendChild(el); }
  next(){ if(this.current+1 < this.players.length) this.load(this.current+1); }
  prev(){ if(this.current-1 >= 0) this.load(this.current-1); }
}

// expose some helpers globally for index.html
window.kbPopular = kbPopular;
window.smartSearch = smartSearch;
window.getFullMovie = getFullMovie;
window.normalizeKBMovie = normalizeKBMovie;
window.PlayerController = PlayerController;
