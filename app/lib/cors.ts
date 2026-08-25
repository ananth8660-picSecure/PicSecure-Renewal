const NATIVE_ORIGINS=["capacitor://localhost","https://localhost","http://localhost","http://localhost:5173"];

function allowedOrigins(){
  const extra=(process.env.PICSECURE_ALLOWED_ORIGINS||"").split(",").map(value=>value.trim()).filter(Boolean);
  return new Set([...NATIVE_ORIGINS,...extra]);
}

export function corsHeaders(request:Request,initial?:HeadersInit){
  const headers=new Headers(initial),origin=request.headers.get("Origin");
  if(origin&&allowedOrigins().has(origin)){
    headers.set("Access-Control-Allow-Origin",origin);
    headers.append("Vary","Origin");
  }
  headers.set("Access-Control-Allow-Methods","GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers","Content-Type, Authorization");
  headers.set("Access-Control-Max-Age","86400");
  headers.set("X-Content-Type-Options","nosniff");
  return headers;
}

export function corsJson(request:Request,body:unknown,init:ResponseInit={}){
  return Response.json(body,{...init,headers:corsHeaders(request,init.headers)});
}

export function corsOptions(request:Request){
  const origin=request.headers.get("Origin");
  if(origin&&!allowedOrigins().has(origin))return corsJson(request,{error:"Origin is not allowed"},{status:403});
  return new Response(null,{status:204,headers:corsHeaders(request)});
}
