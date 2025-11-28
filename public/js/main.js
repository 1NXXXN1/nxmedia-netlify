const qInput = document.getElementById('q');
const results = document.getElementById('results');
const debug = document.getElementById('debug');
const sourceSel = document.getElementById('source');
const searchBtn = document.getElementById('search');
const bmcode = document.getElementById('bmcode');
const bookmarkletLink = document.getElementById('bookmarklet');

function createBookmarklet(){
  const code = `(function(){try{var d={};function send(j){var s=encodeURIComponent(btoa(JSON.stringify(j)));window.open('${location.origin}/watch.html?data='+s);}\n` +
  `var url=location.href;\n` +
  `if(/imdb\\.com\\/title\\//i.test(url)){d.title=document.querySelector('h1')?.innerText||document.title;d.imdb=(url.match(/tt\\d+/)||[])[0]||null;d.poster=document.querySelector('.ipc-media img')?.src||document.querySelector('img.poster')?.src||'';send(d);return}\n` +
  `if(/kinopoisk\\.ru\\/film\\//i.test(url)){d.title=document.querySelector('h1')?.innerText||document.title;var m=url.match(/film\\/(\\d+)/);d.kp=m?m[1]:null;d.poster=document.querySelector('img')?.src||'';send(d);return}\n` +
  `if(/themoviedb\\.org\\/(movie|tv)\\//i.test(url)){d.title=document.querySelector('h2')?.innerText||document.title;var m=url.match(/\\/(movie|tv)\\/(\\d+)/);d.tmdb=m?m[2]:null;d.poster=document.querySelector('.poster img')?.src||'';send(d);return}\n` +
  `if(/letterboxd\\.com\\/film\\//i.test(url)){d.title=document.querySelector('h1')?.innerText||document.title;d.poster=document.querySelector('.poster img')?.src||'';send(d);return}\n` +
  `alert('Bu bookmarkletni faqat film sahifasida ishlating (IMDb/Kinopoisk/TMDB/Letterboxd)');}catch(e){alert('Xato: '+e.message)}})();`;
  return code;
}

function setBookmarklet(){
  const code = createBookmarklet();
  bmcode.value = code;
  bookmarkletLink.href = 'javascript:' + code;
  bookmarkletLink.target = '_self';
  bookmarkletLink.title = 'Drag this to your bookmarks bar';
  bookmarkletLink.onclick = function(e){ e.preventDefault(); alert('Bookmarkletni bookmarks panelga torting (drag & drop) yoki \"Copy\" qilib yangi bookmark sifatida qo\\'ying.'); };
}
setBookmarklet();

searchBtn.addEventListener('click', ()=>{
  const q = qInput.value.trim();
  if(!q){ results.innerHTML=''; return; }
  doSearch(q, sourceSel.value);
});

async function doSearch(q, source='all'){
  results.innerHTML = 'Qidirilmoqda... (brauzer orqali, CORS cheklovlari bo\\'lishi mumkin)';
  debug.textContent = 'Note: If results are empty, open a movie page manually and click the bookmarklet.';
  const tasks = [];
  if(source==='all' || source==='imdb'){
    tasks.push(fetchIMDb(q));
  }
  if(source==='all' || source==='tmdb'){
    tasks.push(fetchTMDB(q));
  }
  if(source==='all' || source==='kp'){
    tasks.push(fetchKP(q));
  }
  if(source==='all' || source==='lb'){
    tasks.push(fetchLB(q));
  }
  try{
    const arrays = await Promise.all(tasks);
    const merged = [];
    const seen = new Set();
    arrays.forEach(arr=>{ if(!arr) return; arr.forEach(item=>{ const key=item.link||item.imdb||item.kp||item.tmdb||item.title; if(!key) return; if(seen.has(key)) return; seen.add(key); merged.push(item); })});
    renderResults(merged);
    debug.textContent = 'Received '+merged.length+' items (may be 0 due to CORS)';
  }catch(e){
    results.innerHTML = '<div style="color:red">Xato: '+e.message+'</div>';
  }
}

function renderResults(items){
  if(!items || items.length===0){ results.innerHTML='<i>Topilmadi</i>'; return; }
  results.innerHTML = items.map(it=>{
    const title = it.title||it.name||it.label||'Noma\\'lum';
    const poster = it.poster||'';
    const payload = btoa(JSON.stringify({ title, tmdb: it.tmdb||null, kp: it.kp||null, imdb: it.imdb||null, poster }));
    const link = '/watch.html?data='+encodeURIComponent(payload);
    return `<div class="card">${poster?'<img src="'+poster+'">':''}<div><strong>${title}</strong><br/><small>${it.source||''}</small><br/><button onclick="window.open('${link}','_blank')">Ko'rish</button></div></div>`;
  }).join('');
}

async function fetchIMDb(q){
  try{
    const url = 'https://www.imdb.com/find?q='+encodeURIComponent(q);
    const r = await fetch(url, { mode:'cors' });
    const text = await r.text();
    const regex = /<a\\s+href="(\\/title\\/tt\\d+\\/[^"]*)".*?>([^<]+)<\\/a>/gi;
    let m; const out=[]; const seen=new Set();
    while((m=regex.exec(text)) && out.length<12){ const href=m[1], title=m[2].trim(); if(seen.has(href)) continue; seen.add(href); out.push({source:'imdb', imdb:(href.match(/tt\\d+/)||[])[0]||null, title, link:'https://www.imdb.com'+href}); }
    return out;
  }catch(e){ console.warn('IMDb fetch failed', e); return []; }
}

async function fetchTMDB(q){
  try{
    const url = 'https://www.themoviedb.org/search?query='+encodeURIComponent(q);
    const r = await fetch(url, { mode:'cors' });
    const text = await r.text();
    const regex = /<a\\s+href="(\\/(movie|tv)\\/\\d+)[^"]*".*?>([^<]+)<\\/a>/gi;
    let m; const out=[]; const seen=new Set();
    while((m=regex.exec(text)) && out.length<12){ const href=m[1], title=m[3].trim(); if(seen.has(href)) continue; seen.add(href); out.push({source:'tmdb', tmdb:(href.match(/\\/(movie|tv)\\/(\\d+)/)||[])[2]||null, title, link:'https://www.themoviedb.org'+href}); }
    return out;
  }catch(e){ console.warn('TMDB fetch failed', e); return []; }
}

async function fetchKP(q){
  try{
    const url = 'https://www.kinopoisk.ru/index.php?kp_query='+encodeURIComponent(q);
    const r = await fetch(url, { mode:'cors' });
    const text = await r.text();
    const regex = /\\/film\\/(\\d+)\\/[^"]*"/gi;
    let m; const out=[]; const seen=new Set();
    while((m=regex.exec(text)) && out.length<12){ const id=m[1]; if(seen.has(id)) continue; seen.add(id); out.push({source:'kp', kp:id, title:null, link:'https://www.kinopoisk.ru/film/'+id+'/'}); }
    return out;
  }catch(e){ console.warn('KP fetch failed', e); return []; }
}

async function fetchLB(q){
  try{
    const url = 'https://letterboxd.com/search/films/'+encodeURIComponent(q)+'/';
    const r = await fetch(url, { mode:'cors' });
    const text = await r.text();
    const regex = /<a\\s+href="(\\/film\\/[^"\\/]+\\/)".*?>([^<]+)<\\/a>/gi;
    let m; const out=[]; const seen=new Set();
    while((m=regex.exec(text)) && out.length<12){ const href=m[1], title=m[2].trim(); if(seen.has(href)) continue; seen.add(href); out.push({source:'lb', title, link:'https://letterboxd.com'+href}); }
    return out;
  }catch(e){ console.warn('LB fetch failed', e); return []; }
}
