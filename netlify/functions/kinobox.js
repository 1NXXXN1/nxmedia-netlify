export async function handler(event){
  const params = event.queryStringParameters || {};
  const base = 'https://api.kinobox.tv/api/';
  if(params.path){
    const path = params.path;
    delete params.path;
    const url = base + path + (Object.keys(params).length ? '&' + new URLSearchParams(params).toString() : '');
    const r = await fetch(url);
    const data = await r.json();
    return { statusCode:200, headers: {"Access-Control-Allow-Origin":"*"}, body: JSON.stringify(data) };
  }
  if(params.kinopoisk){
    const r = await fetch(base + 'players?kinopoisk=' + encodeURIComponent(params.kinopoisk));
    const data = await r.json();
    return { statusCode:200, headers: {"Access-Control-Allow-Origin":"*"}, body: JSON.stringify(data) };
  }
  return { statusCode:400, body: JSON.stringify({error:'no path'}) };
}
