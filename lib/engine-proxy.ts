export type EngineEnv = { BREV_API_URL?: string; BREV_API_KEY?: string };
const json = (body:unknown,status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function engineProxy(request:Request, env:EngineEnv):Promise<Response|null>{
 const path=new URL(request.url).pathname;
 if(path!=='/api/status'&&!path.startsWith('/api/engine/'))return null;
 const configured=!!env.BREV_API_URL&&!!env.BREV_API_KEY;
 if(path==='/api/status'){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  if(!configured)return json({ready:false,mode:'sample'});
  try{const r=await fetch(`${env.BREV_API_URL!.replace(/\/$/,'')}/health`,{headers:{Authorization:`Bearer ${env.BREV_API_KEY}`},signal:AbortSignal.timeout(5000)});const d=await r.json() as {ready?:boolean};return json({ready:r.ok&&d.ready===true,mode:r.ok&&d.ready===true?'live':'sample'});}catch{return json({ready:false,mode:'sample'});}
 }
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(!configured)return json({error:'The practice backend is not connected yet.'},503);
 const endpoint=path.slice('/api/engine/'.length);
 if(!['chat','feedback','transcribe','opening','exercise','assess'].includes(endpoint))return json({error:'Not found'},404);
 const origin=request.headers.get('origin');const target=new URL(request.url);let sameOrigin=!origin||origin===target.origin;try{const browserOrigin=new URL(origin||target.origin);sameOrigin ||= browserOrigin.host===request.headers.get('host')&&browserOrigin.protocol===target.protocol;}catch{}if(!sameOrigin)return json({error:'This request must come from the practice app.'},403);
 const contentType=request.headers.get('content-type')||'';
 if(endpoint==='transcribe'?!contentType.startsWith('multipart/form-data'):!contentType.startsWith('application/json'))return json({error:'Unsupported content type'},415);
 const limit=endpoint==='transcribe'?4*1024*1024+8192:64000;
 if(Number(request.headers.get('content-length'))>limit)return json({error:'Message or recording is too large.'},413);
 // Bound chunked bodies as well as Content-Length bodies.
 const reader=request.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
 if(reader){while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();return json({error:'Message or recording is too large.'},413);}chunks.push(value);}}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 try{const response=await fetch(`${env.BREV_API_URL!.replace(/\/$/,'')}/${endpoint}`,{method:'POST',headers:{Authorization:`Bearer ${env.BREV_API_KEY}`,'Content-Type':contentType},body:bytes,signal:AbortSignal.any([request.signal,AbortSignal.timeout(180000)])});
 if(!response.ok){let message='The practice server could not finish that request. Please try again.';try{const d=await response.json() as {detail?:unknown};if(typeof d.detail==='string')message=d.detail;}catch{}const errorResponse=json({error:message},response.status);const retry=response.headers.get('Retry-After');if(retry)errorResponse.headers.set('Retry-After',retry);return errorResponse;}
 return new Response(response.body,{headers:{'Content-Type':response.headers.get('Content-Type')||'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return json({error:'The practice server is taking too long or is unavailable. Your message is ready to retry.'},502);}
}
