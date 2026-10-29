// Protected Redash Query 266 catalog feed. Authentication is enforced by /functions/_middleware.js.
const clean = v => v == null ? "" : String(v).trim();
export async function onRequest({request,env}) {
  const origin=request.headers.get("Origin"), own=new URL(request.url).origin;
  const allowed=clean(env.DASHBOARD_ORIGIN)||own;
  if(origin && origin!==own && origin!==allowed) return Response.json({error:"Origin not allowed."},{status:403});
  if(!["GET","POST"].includes(request.method) || (request.method==="POST" && request.headers.get("X-Manual-Refresh")!=="1"))
    return Response.json({error:"Method not allowed."},{status:405,headers:{Allow:"GET, POST"}});
  const configured=clean(env.REDASH_CHANNEL_PRODUCTS_QUERY_URL);
  if(!configured) return Response.json({error:"Catalog source is not configured. Add REDASH_CHANNEL_PRODUCTS_QUERY_URL to Cloudflare Secrets."},{status:502});
  let url;
  try {url=new URL(configured); if(url.protocol!=="https:") throw Error("invalid");}
  catch {return Response.json({error:"Catalog source URL is invalid."},{status:502});}
  const headers={Accept:"application/json"};
  if(clean(env.REDASH_QUERY_API_KEY) && !url.searchParams.has("api_key")) headers.Authorization=`Key ${clean(env.REDASH_QUERY_API_KEY)}`;
  try {
    const upstream=await fetch(url.toString(),{headers,cf:{cacheTtl:0,cacheEverything:false}});
    if(!upstream.ok || !upstream.body) return Response.json({error:"Catalog Redash query could not be loaded.",upstreamStatus:upstream.status},{status:502});
    return new Response(upstream.body,{headers:{"content-type":"application/json; charset=utf-8","cache-control":"private, no-store"}});
  } catch {return Response.json({error:"Catalog data source could not be reached."},{status:502});}
}
