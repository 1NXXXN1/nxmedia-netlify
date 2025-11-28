const qInput = document.getElementById('q');
const results = document.getElementById('results');
const debug = document.getElementById('debug');
const sourceSel = document.getElementById('source');
const searchBtn = document.getElementById('searchBtn');

searchBtn.addEventListener('click', () => {
  const q = qInput.value.trim();
  if (!q) { results.innerHTML = ''; return; }
  doSearch(q, sourceSel.value);
});

qInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchBtn.click();
});

async function doSearch(q, source='all') {
  results.innerHTML = '<i>Qidirilmoqda...</i>';
  debug.textContent = 'loading...';
  try {
    const res = await fetch(`/.netlify/functions/search?q=${encodeURIComponent(q)}&source=${encodeURIComponent(source)}`);
    if (!res.ok) throw new Error('Server xatosi ' + res.status);
    const data = await res.json();
    debug.textContent = 'Received ' + (data.length||0) + ' items';
    renderResults(data, q);
  } catch (e) {
    debug.textContent = 'Xato: ' + e.message;
    results.innerHTML = '<div style="color:red">Xato: ' + e.message + '</div>';
  }
}

function pickTitle(item){
  return item.title || item.name || item.original_title || item.original_name || item.nameRu || 'Noma\'lum';
}

function renderResults(data, q) {
  if (!data || data.length === 0) {
    results.innerHTML = '<i>Topilmadi</i>';
    return;
  }
  results.innerHTML = data.map(item => {
    const title = pickTitle(item);
    const poster = item.poster || (item.poster_path ? 'https://image.tmdb.org/t/p/w300' + item.poster_path : '');
    const payload = btoa(JSON.stringify({
      title,
      year: item.release_date || item.first_air_date || '',
      tmdb: item.tmdb || null,
      kp: item.kp || null,
      imdb: item.imdb || null,
      poster: poster
    }));
    const watchLink = '/watch.html?data=' + encodeURIComponent(payload);
    return `
      <div class="card">
        ${poster ? `<img src="${poster}" alt="">` : ''}
        <div>
          <strong>${title}</strong><br/>
          <small>${item.overview ? item.overview.slice(0,150) + '...' : ''}</small><br/>
          <div style="margin-top:8px">
            <button onclick="window.open('${watchLink}','_blank')">Ko'rish</button>
            <button onclick="copyLink('${watchLink}')">Havolani nusxalash</button>
            <span style="margin-left:6px;color:#666">${item.source || ''}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function copyLink(url) {
  navigator.clipboard?.writeText(location.origin + url).then(() => alert('Havola nusxalandi'));
}
