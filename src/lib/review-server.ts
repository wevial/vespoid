import { accessAssertionFromHeaders } from "./cloudflare-access";
// Authorization must complete before even loading private corpus bytes.
export async function serveReviewDataset(headers: Headers, verify: (assertion:string)=>Promise<unknown>, load:()=>Promise<unknown>): Promise<Response> {
 const responseHeaders={"cache-control":"private, no-store, max-age=0","vary":"cf-access-jwt-assertion, Cookie","x-content-type-options":"nosniff"};
 const assertion=accessAssertionFromHeaders(headers);
 if(!assertion)return Response.json({error:"Cloudflare Access identity is required"},{status:401,headers:responseHeaders});
 try {await verify(assertion);} catch {return Response.json({error:"Cloudflare Access authorization failed"},{status:401,headers:responseHeaders});}
 return Response.json(await load(),{headers:responseHeaders});
}
