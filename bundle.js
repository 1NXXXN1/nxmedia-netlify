// FIXED FULL bundle.js — Variant B final (no recursive exports, autoSelect alias)

// --- Core HTTP ---
const TIMEOUT = 10000, MAX_RETRY = 3;
const inflight = new Map();
function withTimeout(promise, ms = TIMEOUT) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("HTTP_TIMEOUT")), ms))]);
}
async function doFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error("HTTP_STATUS_" + res.status);
  const ct = (res.headers.get('content-type')||'').toLowerCase();
  if (ct.includes('application/json')) return res.json();
  return res.text();
}
async function http(url, opts = {}, retry = 0) {
  const key = url + JSON.stringify(opts||{});
  if (inflight.has(key)) return inflight.get(key);
  const exec = (async () => {
    try { return await withTimeout(doFetch(url, opts)); }
    catch (err) {
      if (retry < MAX_RETRY) { await new Promise(r=>setTimeout(r, 200*(retry+1))); return http(url, opts, retry+1); }
      throw err;
    }
  })();
  inflight.set(key, exec);
  exec.finally(()=>inflight.delete(key));
  return exec;
}

// --- Cache ---
class Cache { constructor(ttl=5*60*1000,max=500){ this.ttl=ttl; this.max=max; this.map=new Map(); }
  _isExpired(e){ return Date.now()-e.time>this.ttl; }
  get(k){ const e=this.map.get(k); if(!e) return null; if(this._isExpired(e)){ this.map.delete(k); return null; } this.map.delete(k); this.map.set(k,e); return e.value; }
  set(k,v){ if(this.map.size>=this.max){ const first=this.map.keys().next().value; this.map.delete(first); } this.map.set(k,{value:v,time:Date.now()}); }
}
const cache = new Cache();

// --- Kinobox (direct) ---
const KB_BASE = "https://api.kinobox.tv/api";
async function kbGet(path, params={}){
  const q = new URLSearchParams(params).toString();
  const url = KB_BASE + path + (q ? "?" + q : "");
  return http(url);
}
async function kbGetMovie(id){ return kbGet(`/movies/${id}`); }
async function kbGetPlayers(kinopoiskId){ return kbGet(`/players`, { kinopoisk: kinopoiskId }); }
async function kbSearch(query){ return kbGet(`/movies/search/`, { query }); }
async function kbPopularInner(page=1){ return kbGet(`/popular`, { page }); }
async function kbEpisodes(id){ return kbGet(`/episodes/${id}`); }
async function kbSimilarByKBId(id){ return kbGet(`/similar/${id}`); }

// --- KP proxy helpers (/kp) ---
function kpPath(path, extra=""){ return '/kp?path=' + encodeURIComponent(path) + (extra? '&'+extra : ''); }
async function kpSearch(query){ return http(kpPath("v2.1/films/search-by-keyword", "keyword="+encodeURIComponent(query))); }
async function kpGetMovie(id){ return http(kpPath("v2.2/films/"+encodeURIComponent(id))); }
async function kpGetSimilar(id){ return http(kpPath("v2.2/films/"+encodeURIComponent(id)+"/similars")); }

// --- Normalizers ---
const g=(o,k,d=null)=>(o && o[k]!==undefined ? o[k] : d);
function normalizeTitleAny(obj){ if(!obj) return ""; if(typeof obj==="string") return obj; return g(obj,"russian")||g(obj,"nameRu")||g(obj,"name")||g(obj,"title")||g(obj,"original")||""; }
function normalizeKBMovie(raw){ if(!raw) return null; const title = normalizeTitleAny(raw.title||raw); return { id: g(raw,"id")||g(raw,"movieId")||g(raw,"filmId")||null, kpId: g(raw,"kinopoiskId")||g(raw,"kinopoisk_id")||g(raw,"kp_id")||null, imdbId: g(raw,"imdb")||g(raw,"imdbId")||null, title, originalTitle: g(raw,"originalTitle")||g(raw,"orig_title")||null, year: g(raw,"year")||null, description: g(raw,"description")||g(raw,"desc")||null, poster: g(raw,"poster")||g(raw,"posterPreview")||g(raw,"poster_url")||null, genres: g(raw,"genres")||[], countries: g(raw,"countries")||[], rating:{ kp:g(raw,"rating_kp"), imdb:g(raw,"rating_imdb"), kinobox:g(raw,"rating") }, isSeries: !!g(raw,"isSeries") || (g(raw,"type")==="series"), raw }; }
function normalizeKPMovie(raw){ if(!raw) return null; return { source:"kp", id: g(raw,"filmId")||g(raw,"kinopoiskId")||null, kpId: g(raw,"filmId")||g(raw,"kinopoiskId")||null, imdbId: g(raw,"imdbId")||null, title: normalizeTitleAny({ russian: g(raw,"nameRu"), name: g(raw,"nameOriginal") }), originalTitle: g(raw,"nameOriginal")||g(raw,"nameEn")||null, year: g(raw,"year")||null, description: g(raw,"shortDescription")||g(raw,"description")||null, poster: g(raw,"posterUrl")||g(raw,"posterUrlPreview")||null, genres: (g(raw,"genres")||[]).map(x=> typeof x==='string'?x:(x.genre||x.name)).filter(Boolean), countries: g(raw,"countries")||[], rating: { kp: g(raw,"rating")||g(raw,"ratingKinopoisk"), imdb: g(raw,"ratingImdb") }, isSeries: !!g(raw,"serial")||!!g(raw,"isSeries"), raw }; }
function normalizeSearchList(raw){ if(!raw) return []; if(Array.isArray(raw)) return raw.map(normalizeKBMovie); if(raw.data && Array.isArray(raw.data.items)) return raw.data.items.map(normalizeKBMovie); if(raw.items && Array.isArray(raw.items)) return raw.items.map(normalizeKBMovie); if(raw.results && Array.isArray(raw.results)) return raw.results.map(normalizeKBMovie); return []; }
function normalizePlayers(raw){ if(!raw) return []; const list = raw.playlist || raw.data || raw.players || raw; if(!Array.isArray(list)) return []; return list.map(p=>({ id:p.id||null, name:p.name||p.title||"Player", iframe:p.iframe||p.src||p.url||p.file||null, quality:p.quality||null, provider:p.provider||p.host||null, raw:p })); }
function normalizeEpisodes(raw){ if(!raw) return []; if(raw.seasons) return raw.seasons; if(raw.data && raw.data.seasons) return raw.data.seasons; return raw; }
function normalizeSimilar(raw){ const items = raw && (raw.items || raw.data && raw.data.items || raw.similar) || []; return (Array.isArray(items)? items:[]).map(normalizeKPMovie); }

// --- Smart Search ---
async function smartSearch(query, opts={}){
  if(!query || !String(query).trim()) return { source:"none", items:[] };
  const key = 'smart:'+query+':'+(opts.page||1)+':'+(opts.forceKB?1:0);
  const cached = cache.get(key); if(cached) return cached;
  if(!opts.forceKB){
    try{
      const kpR = await kpSearch(query);
      if(kpR && Array.isArray(kpR.films) && kpR.films.length){
        const items = kpR.films.map(normalizeKPMovie);
        const out = { source:"kp", items };
        cache.set(key,out); return out;
      }
    }catch(e){ console.warn("kpSearch err", e && e.message); }
  }
  try{
    const kbR = await kbSearch(query);
    const items = normalizeSearchList(kbR);
    const out = { source:"kb", items };
    cache.set(key,out); return out;
  }catch(e){ console.warn("kbSearch err", e && e.message); return { source:"none", items:[] }; }
}

// --- getFullMovie ---
async function getFullMovie({ kpId=null, kbId=null, prefer="kp" }={}){
  if(!kpId && !kbId) throw new Error("getFullMovie requires kpId or kbId");
  const key = `full:${kpId||''}:${kbId||''}:${prefer}`;
  const cached = cache.get(key); if(cached) return cached;
  let kp=null, kb=null, players=[], episodes=null, similar=[];
  if(kpId){
    try{ kp = normalizeKPMovie(await kpGetMovie(kpId)); }catch(e){ console.warn("kpGetMovie failed", e && e.message); }
  }
  if(kbId){
    try{ kb = normalizeKBMovie(await kbGetMovie(kbId)); }catch(e){ console.warn("kbGetMovie failed", e && e.message); }
  }
  try{ const rawPlayers = await kbGetPlayers(kpId || kbId); players = normalizePlayers(rawPlayers); }catch(e){ /* ignore */ }
  try{ if(kb && kb.id) episodes = normalizeEpisodes(await kbEpisodes(kb.id)); else if(kp && kp.isSeries) episodes = normalizeEpisodes((await kpGetMovie(kpId))?.seasons || null); }catch(e){ /* ignore */ }
  try{
    if(kpId){
      const rawSim = await kpGetSimilar(kpId);
      let list = [];
      if(Array.isArray(rawSim)) list = rawSim;
      else if(rawSim && Array.isArray(rawSim.items)) list = rawSim.items;
      else if(rawSim && Array.isArray(rawSim.similarFilms)) list = rawSim.similarFilms;
      else list = [];
      similar = list.map(normalizeKPMovie).filter(Boolean);
    } else if(kb && kb.id){
      similar = normalizeSimilar(await kbSimilarByKBId(kb.id));
    }
  }catch(e){ console.warn("similar failed", e && e.message); similar = []; }
  const merged = { id: kp?.kpId || kb?.id || kpId || kbId || null, title: kp?.title || kb?.title || kp?.originalTitle || kb?.originalTitle || null, originalTitle: kp?.originalTitle || kb?.originalTitle || null, year: kp?.year || kb?.year || null, description: kp?.description || kb?.description || null, poster: kp?.poster || kb?.poster || null, genres: (kp?.genres && kp.genres.length ? kp.genres : kb?.genres) || [], countries: (kp?.countries && kp.countries.length ? kp.countries : kb?.countries) || [], rating: Object.assign({}, kb?.rating||{}, kp?.rating||{}), players, episodes, similar, raw:{ kp, kb } };
  const out = { sourcePrimary: kp? "kp": (kb? "kb":"unknown"), kp, kb, players, episodes, similar, merged };
  cache.set(key, out);
  return out;
}

// --- Providers/PlayerController ---
const Providers=[ {key:"kodik",detect:u=>!!u&&u.includes("kodik"),priority:1},{key:"videocdn",detect:u=>!!u&&u.includes("videocdn"),priority:2},{key:"collaps",detect:u=>!!u&&u.includes("collaps"),priority:3},{key:"hdvb",detect:u=>!!u&&u.includes("hdvb"),priority:4},{key:"moonwalk",detect:u=>!!u&&u.includes("moonwalk"),priority:5},{key:"unknown",detect:_=>true,priority:999} ];
function detectProvider(url){ return Providers.find(p=>p.detect(url)) || Providers[Providers.length-1]; }
function testIframe(url, timeout=3500){ return new Promise(resolve=>{ if(!url){ resolve(false); return; } const iframe=document.createElement('iframe'); iframe.style.display='none'; iframe.src=url; let done=false; const timer=setTimeout(()=>{ if(!done){ done=true; try{ iframe.remove(); }catch(e){} resolve(false); } }, timeout); iframe.onload=()=>{ if(!done){ done=true; try{ iframe.remove(); }catch(e){} resolve(true); } }; document.body.appendChild(iframe); }); }
async function resolveBestPlayer(players){ if(!Array.isArray(players)||!players.length) return null; const sorted=players.map(p=>({...p,provider:detectProvider(p.iframe)})).sort((a,b)=>a.provider.priority-b.provider.priority); for(const p of sorted){ try{ if(p.iframe && await testIframe(p.iframe)) return p; }catch(e){} } return null; }
class PlayerController{ constructor(players){ this.players=players||[]; this.current=-1; this.listeners={load:[],error:[],change:[]}; } on(ev,fn){ if(this.listeners[ev]) this.listeners[ev].push(fn);} emit(ev,d){ (this.listeners[ev]||[]).forEach(fn=>{ try{ fn(d); }catch(e){} }); } async auto(){ const best=await resolveBestPlayer(this.players); if(!best){ this.emit('error','No working iframe'); return; } const idx=this.players.findIndex(p=>p===best); this.load(idx); } autoSelect(){ return this.auto(); } load(i){ if(i<0||i>=this.players.length) return; this.current=i; const p=this.players[i]; this.emit('change',p); const old=document.getElementById('player-iframe'); if(old) old.remove(); const el=document.createElement('iframe'); el.id='player-iframe'; el.src=p.iframe; el.allowFullscreen = true; el.onload = ()=> this.emit('load', p); document.getElementById('player').appendChild(el); } next(){ if(this.current+1 < this.players.length) this.load(this.current+1); } prev(){ if(this.current-1 >= 0) this.load(this.current-1); } }

// --- Exports (correct, no recursion) ---
window._kbPopularImpl = kbPopularInner; // keep internal reference
window.kbPopular = async function(page=1){
  try{ return await window._kbPopularImpl(page); }catch(e){ console.warn("kbPopular err", e && e.message); return []; }
};
window.smartSearch = smartSearch;
window.getFullMovie = getFullMovie;
window.PlayerController = PlayerController;
window.normalizeKBMovie = normalizeKBMovie;

window._bundle_ready = true;
