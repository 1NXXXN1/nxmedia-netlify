// core/http.js
const TIMEOUT = 10000;
const MAX_RETRY = 3;
const inflight = new Map();

function withTimeout(promise, ms = TIMEOUT) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("HTTP_TIMEOUT")), ms))
    ]);
}

async function doFetch(url, opts = {}) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error("HTTP_STATUS_" + res.status);
    return res.json();
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


// core/cache.js
class Cache {
    constructor(ttl = 60000, max = 200) {
        this.ttl = ttl;
        this.max = max;
        this.map = new Map();
    }
    _isExpired(entry) {
        return Date.now() - entry.time > this.ttl;
    }
    get(key) {
        const entry = this.map.get(key);
        if (!entry) return null;
        if (this._isExpired(entry)) {
            this.map.delete(key);
            return null;
        }
        this.map.delete(key);
        this.map.set(key, entry);
        return entry.value;
    }
    set(key, value) {
        if (this.map.size >= this.max) {
            const firstKey = this.map.keys().next().value;
            this.map.delete(firstKey);
        }
        this.map.set(key, { value, time: Date.now() });
    }
}
const globalCache = new Cache();


// kinobox/api.js
const KB_BASE = "https://api.kinobox.tv/api";
async function kbGet(path, params = {}) {
    const q = new URLSearchParams(params).toString();
    return http(KB_BASE + path + (q ? "?" + q : ""));
}
function kbGetMovie(id){ return kbGet(`/movies/${id}`); }
function kbGetPlayers(kinopoiskId){ return kbGet(`/players`, { kinopoisk: kinopoiskId }); }
function kbSearch(query){ return kbGet(`/movies/search/`, { query }); }
function kbPopular(page=1){ return kbGet(`/popular`, { page }); }
function kbSimilar(id){ return kbGet(`/similar/${id}`); }
function kbCollections(){ return kbGet(`/collections`); }
function kbCollection(id){ return kbGet(`/collections/${id}`); }
function kbEpisodes(id){ return kbGet(`/episodes/${id}`); }
function kbPerson(id){ return kbGet(`/persons/${id}`); }
function kbProviders(){ return kbGet(`/providers`); }


// kinobox/normalize.js
const g = (o,k,d=null)=>o&&o[k]!==undefined?o[k]:d;
function normalizeTitle(obj){
    if(!obj) return "";
    if(typeof obj==="string") return obj;
    return g(obj,"russian")||g(obj,"russianName")||g(obj,"ru")||g(obj,"name")||g(obj,"title")||g(obj,"original")||g(obj,"orig_title")||g(obj,"en")||"";
}
function normalizeKBMovie(raw){
    if(!raw) return null;
    const title=normalizeTitle(raw.title||raw);
    return {
        id: raw.id||raw.movieId||raw.filmId||null,
        kpId: raw.kinopoiskId||raw.kinopoisk_id||raw.kp_id||null,
        imdbId: raw.imdb||raw.imdbId||null,
        title,
        originalTitle: raw.originalTitle||raw.orig_title||null,
        year: raw.year||null,
        description: raw.description||raw.desc||null,
        poster: raw.poster||raw.posterPreview||raw.poster_url||raw.cover||null,
        countries: raw.countries||[],
        genres: raw.genres||[],
        rating:{ kp:g(raw,"rating_kp"), imdb:g(raw,"rating_imdb"), kinobox:g(raw,"rating") },
        isSeries: raw.isSeries||raw.type==="series"||false,
        raw
    };
}
function normalizeSearchList(raw){
    let items=[];
    if(Array.isArray(raw)) items=raw;
    else if(raw?.data?.items) items=raw.data.items;
    else if(raw?.items) items=raw.items;
    else if(raw?.results) items=raw.results;
    return items.map(normalizeKBMovie);
}
function normalizePlayers(raw){
    const list = raw.playlist||raw.data||raw.players||raw;
    if(!Array.isArray(list)) return [];
    return list.map(p=>({
        id:p.id||null,
        name:p.name||p.title||"Player",
        iframe:p.iframe||p.src||null,
        quality:p.quality||null,
        translator:p.translator||null,
        provider:p.provider||p.host||null,
        raw:p
    }));
}
function normalizeEpisodes(raw){
    if(raw?.seasons) return raw.seasons;
    if(raw?.data?.seasons) return raw.data.seasons;
    return raw;
}
function normalizeSimilar(raw){
    const items=raw?.items||raw?.data?.items||raw?.similar||[];
    return items.map(normalizeKBMovie);
}


// kp/api.js
function kpProxyUrl(path,query=""){
    const encodedPath=encodeURIComponent(path);
    const q=query?`&${query}`:"";
    return `/kp?path=${encodedPath}${q}`;
}
async function kpSearch(query){
    return http(kpProxyUrl("v2.1/films/search-by-keyword",`keyword=${encodeURIComponent(query)}`));
}
async function kpGetMovie(id){
    return http(kpProxyUrl(`v2.2/films/${encodeURIComponent(id)}`));
}


// kp/normalize.js
function normalizeKPTitle(raw){
    return raw?.nameRu||raw?.nameOriginal||raw?.nameEn||raw?.name||"";
}
function normalizeKPMovie(raw){
    return {
        source:"kinopoisk",
        id: raw.filmId||raw.kinopoiskId||null,
        kpId: raw.filmId||raw.kinopoiskId||null,
        imdbId: raw.imdbId||null,
        title: normalizeKPTitle(raw),
        originalTitle: raw.nameOriginal||raw.nameEn||null,
        year: raw.year||null,
        description: raw.shortDescription||raw.description||null,
        poster: raw.posterUrl||raw.posterUrlPreview||null,
        genres:(raw.genres||[]).map(g=>g.genre||g.name||g).filter(Boolean),
        countries: raw.countries||[],
        rating:{ kp:raw.rating||raw.ratingKinopoisk, imdb:raw.ratingImdb },
        isSeries: !!raw.serial||!!raw.isSeries,
        raw
    };
}


// search/smart.js
async function smartSearch(query,opts={}){
    if(!query) return {source:"none",items:[]};
    try{
        const kpRes=await kpSearch(query);
        if(kpRes?.films?.length){
            const items=kpRes.films.map(normalizeKPMovie);
            return {source:"kp",items};
        }
    }catch(e){}
    try{
        const kbRes=await kbSearch(query);
        const items=normalizeSearchList(kbRes);
        return {source:"kb",items};
    }catch(e){}
    return {source:"none",items:[]};
}


// movie/full.js
async function getFullMovie({kpId=null,kbId=null}={}){
    let kpData=null,kbData=null,players=[],episodes=null,similar=[];
    if(kpId){
        try{ kpData=normalizeKPMovie(await kpGetMovie(kpId)); }catch(e){}
    }
    if(kbId){
        try{ kbData=normalizeKBMovie(await kbGetMovie(kbId)); }catch(e){}
    }
    try{
        const rawPlayers=await kbGetPlayers(kpId||kbId);
        players=normalizePlayers(rawPlayers);
    }catch(e){}
    try{
        similar=normalizeSimilar(await kbSimilar(kbId||kpId));
    }catch(e){}
    const merged={
        id: kpData?.kpId||kbData?.id,
        title: kpData?.title||kbData?.title,
        year: kpData?.year||kbData?.year,
        description: kpData?.description||kbData?.description,
        poster: kpData?.poster||kbData?.poster,
        players, similar
    };
    return {kpData,kbData,players,similar,merged};
}


// player/providers+resolver+controller.js
const Providers=[
 {key:"kodik",detect:url=>url.includes("kodik"),priority:1},
 {key:"videocdn",detect:url=>url.includes("videocdn"),priority:2},
 {key:"collaps",detect:url=>url.includes("collaps"),priority:3},
 {key:"hdvb",detect:url=>url.includes("hdvb"),priority:4},
 {key:"unknown",detect:_=>true,priority:999}
];
function detectProvider(url){ return Providers.find(p=>p.detect(url))||Providers[Providers.length-1]; }
function testIframe(url){
 return new Promise(resolve=>{
   const iframe=document.createElement("iframe");
   iframe.style.display="none";
   iframe.src=url;
   let done=false;
   const timer=setTimeout(()=>{if(!done){done=true;document.body.removeChild(iframe);resolve(false);}},4000);
   iframe.onload=()=>{if(!done){done=true;document.body.removeChild(iframe);resolve(true);}};
   document.body.appendChild(iframe);
 });
}
async function resolveBestPlayer(players){
 const sorted=players.map(p=>({...p,provider:detectProvider(p.iframe)})).sort((a,b)=>a.provider.priority-b.provider.priority);
 for(const p of sorted){
   if(await testIframe(p.iframe)) return p;
 }
 return null;
}
class PlayerController{
 constructor(players){ this.players=players; this.current=-1;}
 async autoSelect(){ const best=await resolveBestPlayer(this.players); if(best){this.load(this.players.indexOf(best));}}
 load(i){
  if(i<0||i>=this.players.length) return;
  this.current=i;
  const p=this.players[i];
  const old=document.getElementById("player-iframe");
  if(old) old.remove();
  const iframe=document.createElement("iframe");
  iframe.id="player-iframe";
  iframe.src=p.iframe;
  iframe.allowFullscreen=true;
  document.getElementById("player").appendChild(iframe);
 }
}
