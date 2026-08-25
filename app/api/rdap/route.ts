import { NextRequest } from "next/server";
import { corsJson, corsOptions } from "../../lib/cors";

export async function GET(request:NextRequest){
  const domain=request.nextUrl.searchParams.get("domain")?.trim().toLowerCase();
  if(!domain||!/^(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(domain))return corsJson(request,{error:"Enter a valid domain"},{status:400});
  try{
    const response=await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`,{headers:{Accept:"application/rdap+json, application/json"}});
    if(!response.ok)return corsJson(request,{error:"Registry lookup failed"},{status:response.status});
    const data=await response.json() as {events?:Array<{eventAction?:string;eventDate?:string}>};
    const expiry=data.events?.find(event=>["expiration","expiry","expires"].includes(event.eventAction?.toLowerCase()??""));
    return corsJson(request,{domain,expiresOn:expiry?.eventDate??null,checkedAt:new Date().toISOString()},{headers:{"Cache-Control":"public, max-age=300"}});
  }catch{return corsJson(request,{error:"Registry is temporarily unavailable"},{status:502})}
}

export async function OPTIONS(request:NextRequest){return corsOptions(request)}
