async function kinoboxSearch(query) {
  const res = await fetch(`/kinobox?path=movies/search/?query=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Kinobox search failed');
  return res.json();
}

async function kinoboxGetMovie(id) {
  const res = await fetch(`/kinobox?path=movies/${id}`);
  if (!res.ok) throw new Error('Kinobox get movie failed');
  return res.json();
}

async function kinoboxPlayersByKP(kpId) {
  const res = await fetch(`/kinobox?path=players&kinopoisk=${encodeURIComponent(kpId)}`);
  if (!res.ok) throw new Error('Kinobox players failed');
  return res.json();
}
