export async function handler(event){
 const params=event.queryStringParameters;
 const url="https://api.kinobox.tv/api/players?"+new URLSearchParams(params);
 const r=await fetch(url);
 const data=await r.json();
 return {statusCode:200,headers:{"Access-Control-Allow-Origin":"*"},body:JSON.stringify(data)};
}