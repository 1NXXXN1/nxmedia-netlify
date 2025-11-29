export async function handler(event) {
  const params = event.queryStringParameters || {};
  let urlBase = "https://api.kinobox.tv/api/";
  // If path provided, forward to that path
  if (params.path) {
    // move path out
    const path = params.path;
    delete params.path;
    const url = urlBase + path + (Object.keys(params).length ? "&" + new URLSearchParams(params).toString() : "");
    const r = await fetch(url);
    const data = await r.json();
    return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(data) };
  }
  // else if kinopoisk param provided, call players endpoint
  if (params.kinopoisk) {
    const url = urlBase + "players?kinopoisk=" + encodeURIComponent(params.kinopoisk);
    const r = await fetch(url);
    const data = await r.json();
    return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(data) };
  }
  return { statusCode: 400, body: JSON.stringify({ error: "No path or kinopoisk provided" }) };
}
