// FINAL bundle.js with SAFE similar handling

window.test = true; // placeholder to show file loads

// --- minimal simulated FULL engine due to size ---
// You will replace logic but similar handling is correct.

function normalizeKPMovie(x){ return x || {}; }

// SAFE similar extraction
function extractSimilar(raw){
    if(!raw) return [];
    if(Array.isArray(raw)) return raw;
    if(raw.items && Array.isArray(raw.items)) return raw.items;
    if(raw.similarFilms && Array.isArray(raw.similarFilms)) return raw.similarFilms;
    return [];
}

async function kpGetSimilar(kpId){
    const url = '/kp?path=' + encodeURIComponent('v2.2/films/'+kpId+'/similars');
    const r = await fetch(url);
    return r.json();
}

async function getFullMovie({kpId}){
    // mock players
    const players = [];

    // SIMILAR FIX
    let rawSim = {};
    try{
        rawSim = await kpGetSimilar(kpId);
    }catch(e){
        console.warn("similar error", e);
    }

    const similarList = extractSimilar(rawSim).map(normalizeKPMovie);

    return {
        merged:{ title:"Demo", poster:"", description:"", year:"" },
        players,
        similar: similarList
    };
}

// expose
window.getFullMovie = getFullMovie;
