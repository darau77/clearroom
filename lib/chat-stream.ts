/** Only a terminal done event commits a reply or allows audio playback. */
export async function readChatStream(body:ReadableStream<Uint8Array>,onLanguage?:(code:string)=>void){
 const reader=body.getReader();const decoder=new TextDecoder();let buffer='',text='',complete=false;
 function parse(line:string){if(!line.trim())return;const event=JSON.parse(line);if(event.error)throw new Error(String(event.error));if(complete)throw new Error('Unexpected data after the reply finished.');if(typeof event.token==='string')text+=event.token;if(typeof event.language==='string')onLanguage?.(event.language);if(event.done===true)complete=true;}
 try{while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines)parse(line);}buffer+=decoder.decode();if(buffer.trim())parse(buffer);if(!complete||!text.trim())throw new Error('The reply was interrupted. Your message is saved—please retry.');return text;}finally{reader.releaseLock();}
}
