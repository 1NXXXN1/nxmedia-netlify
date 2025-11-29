// bundle.js (fixed similar API)

// ... existing code placeholder ...

async function getSimilarFixed(kpId){
  const raw = await http('/kp?path=' + encodeURIComponent('v2.2/films/'+kpId+'/similars'));
  const items = raw?.items || raw?.similarFilms || [];
  return items.map(normalizeKPMovie);
}

// export for runtime
window.getSimilarFixed = getSimilarFixed;
