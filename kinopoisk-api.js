async function kpSearch(query) {
  const res = await fetch(`/kp?path=v2.1/films/search-by-keyword&query=keyword=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('KP search failed');
  return res.json();
}

async function kpGetMovie(id) {
  const res = await fetch(`/kp?path=v2.2/films/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('KP get movie failed');
  return res.json();
}
