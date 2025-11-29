export async function handler(event) {
  const path = event.queryStringParameters.path || "";
  const query = event.queryStringParameters.query || "";
  const url = "https://kinopoiskapiunofficial.tech/api/" + path + (query ? "?" + query : "");
  const r = await fetch(url, {headers:{"X-API-KEY":"44e30bee-247c-4c63-ac1d-783c624b7b3e"}});
  const data = await r.json();
  return {statusCode:200,headers:{"Access-Control-Allow-Origin":"*"},body:JSON.stringify(data)};
}
