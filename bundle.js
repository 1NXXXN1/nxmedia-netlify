// CLEAN FULL BUNDLE.JS — VARIANT 1
// No BOM, no strange chars, safe UTF‑8, browser‑safe

// --- CORE HTTP ENGINE ---
const TIMEOUT = 10000;
const RETRY = 2;

async function http(url, opts={}, retry=0){
    try{
        const r = await Promise.race([
            fetch(url,opts),
            new Promise((_,rej)=>setTimeout(()=>rej("TIMEOUT"),TIMEOUT))
        ]);
        if(!r.ok) throw r.status;
        const ct = r.headers.get("content-type")||"";
        return ct.includes("json") ? r.json() : r.text();
    }catch(e){
        if(retry < RETRY) return http(url,opts,retry+1);
        throw e;
    }
}

// --- KINOBOX DIRECT ---
const KB_BASE = "https://api.kinobox.tv/api";

function kbGet(path, params={}){
    const q = new URLSearchParams(params).toString();
    return http(KB_BASE + path + (q?("?"+q):""));
}
const kbPopular  = (p=1)=>kbGet("/popular",{page:p});
const kbSearch   = (q)=>kbGet("/movies/search/",{query:q});
const kbMovie    = (id)=>kbGet("/movies/"+id);
const kbPlayers  = (kp)=>kbGet("/players",{kinopoisk:kp});
const kbEpisodes = (id)=>kbGet("/episodes/"+id);
const kbSimilar  = (id)=>kbGet("/similar/"+id);

// --- KP VIA /kp PROXY ---
function kp(path,extra=""){
    return http("/kp?path=" + encodeURIComponent(path) + (extra?("&"+extra):""));
}
const kpMovie   = (id)=>kp("v2.2/films/"+id);
const kpSearch  = (q)=>kp("v2.1/films/search-by-keyword","keyword="+encodeURIComponent(q));
const kpSimilar = (id)=>kp("v2.2/films/"+id+"/similars");

// --- NORMALIZERS ---
function normKB(item){
    if(!item) return null;
    return {
        id: item.id || item.movieId || null,
        kpId: item.kinopoiskId || item.kp_id || null,
        title: item.title?.russian || item.title || item.name || "",
        year: item.year || null,
        poster: item.poster || item.posterPreview || null,
        description: item.description || "",
        raw:item
    };
}
function normKP(item){
    if(!item) return null;
    return {
        id: item.filmId || item.kinopoiskId,
        kpId: item.filmId || item.kinopoiskId,
        title: item.nameRu || item.nameOriginal || item.nameEn || "",
        year: item.year || null,
        poster: item.posterUrlPreview || item.posterUrl,
        description: item.shortDescription || item.description || "",
        raw:item
    };
}

// --- SMART SEARCH ---
async function smartSearch(q){
    if(!q) return {items:[],source:"none"};
    try{
        const r = await kpSearch(q);
        if(r?.films?.length) return {items: r.films.map(normKP), source:"kp"};
    }catch(e){}
    try{
        const r = await kbSearch(q);
        const list = r?.items || r?.data?.items || [];
        return {items:list.map(normKB),source:"kb"};
    }catch(e){}
    return {items:[],source:"none"};
}

// --- FULL MOVIE ---
async function getFullMovie({kpId}){
    const out = {merged:{},players:[],episodes:[],similar:[]};

    let kp=null, kb=null;

    try{ kp = normKP(await kpMovie(kpId)); }catch(e){}
    try{ 
        if(kp?.kpId) kb = normKB(await kbMovie(kp.kpId)); 
    }catch(e){}

    try{
        const p = await kbPlayers(kpId);
        out.players = (p?.playlist || p?.players || []).map(x=>({
            iframe:x.iframe || x.src || x.url,
            raw:x
        }));
    }catch(e){}

    try{
        if(kb?.id){
            const e = await kbEpisodes(kb.id);
            out.episodes = e?.seasons || [];
        }
    }catch(e){}

    try{
        const s = await kpSimilar(kpId);
        let list = s?.items || s?.similarFilms || [];
        if(!Array.isArray(list)) list = [];
        out.similar = list.map(normKP);
    }catch(e){ out.similar=[]; }

    out.merged = kp || kb || {};
    return out;
}

// --- PLAYER CONTROLLER ---
class PlayerController{
    constructor(list){ this.list=list||[]; this.cur=-1; }
    load(i){
        if(i<0||i>=this.list.length) return;
        this.cur=i;
        const url = this.list[i].iframe;
        const box = document.getElementById("player");
        box.innerHTML="";
        const f = document.createElement("iframe");
        f.src=url;
        f.allowFullscreen=true;
        f.id="player-iframe";
        box.appendChild(f);
    }
    auto(){
        if(this.list.length) this.load(0);
    }
}

// EXPORTS
window.kbPopular=kbPopular;
window.smartSearch=smartSearch;
window.getFullMovie=getFullMovie;
window.PlayerController=PlayerController;
window.normalizeKBMovie=normKB;
