export async function handler(event) {
  const params = event.queryStringParameters;
  const base = "https://api.kinobox.tv/api/";
  let url="";
  if(params.path){
     url = base + params.path + "?" + new URLSearchParams(params).toString();
  } else if(params.kinopoisk){
     url = base + "players?kinopoisk="+params.kinopoisk;
  }
  const r = await fetch(url);
  const data = await r.json();
  return {statusCode:200,headers:{"Access-Control-Allow-Origin":"*"},body:JSON.stringify(data)};
}
