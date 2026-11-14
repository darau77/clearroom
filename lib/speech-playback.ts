/** Keeps cancelled or muted replies from restarting as more streamed text arrives. */
export class SpeechPlayback {
 private engine: Pick<SpeechSynthesis,'speak'|'cancel'>;
 private makeUtterance: (text:string)=>SpeechSynthesisUtterance;
 private onSpeaking: (speaking:boolean)=>void;
 private onError: ()=>void;
 private enabled=false;
 private stopped=true;
 private generation=0;
 private queued=0;
 constructor(engine:Pick<SpeechSynthesis,'speak'|'cancel'>,makeUtterance:(text:string)=>SpeechSynthesisUtterance,onSpeaking:(speaking:boolean)=>void,onError:()=>void){this.engine=engine;this.makeUtterance=makeUtterance;this.onSpeaking=onSpeaking;this.onError=onError;}
 setEnabled(enabled:boolean){this.enabled=enabled;if(!enabled)this.stop();}
 stop(){this.generation++;this.stopped=true;this.queued=0;this.engine.cancel();this.onSpeaking(false);}
 beginTurn(){this.stop();this.stopped=false;}
 enqueue(text:string){
  if(!this.enabled||this.stopped||!text.trim())return;
  const id=this.generation;const utterance=this.makeUtterance(text);utterance.lang='en-US';utterance.rate=.96;this.queued++;
  utterance.onstart=()=>{if(id===this.generation&&!this.stopped)this.onSpeaking(true);};
  utterance.onend=()=>{if(id===this.generation){this.queued=Math.max(0,this.queued-1);if(!this.queued)this.onSpeaking(false);}};
  utterance.onerror=()=>{if(id===this.generation){this.stop();this.onError();}};
  try{this.engine.speak(utterance);}catch{if(id===this.generation){this.stop();this.onError();}}
 }
}
