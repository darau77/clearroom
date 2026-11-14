/** Keeps cancelled or muted replies from restarting as more streamed text arrives. */
export class SpeechPlayback {
 private engine: Pick<SpeechSynthesis,'speak'|'cancel'> & Partial<Pick<SpeechSynthesis,'getVoices'>>;
 private makeUtterance: (text:string)=>SpeechSynthesisUtterance;
 private onSpeaking: (speaking:boolean)=>void;
 private onError: (message?:string)=>void;
 private language="en";
 private enabled=false;
 private stopped=true;
 private generation=0;
 private queued=0;
 constructor(engine:Pick<SpeechSynthesis,'speak'|'cancel'> & Partial<Pick<SpeechSynthesis,'getVoices'>>,makeUtterance:(text:string)=>SpeechSynthesisUtterance,onSpeaking:(speaking:boolean)=>void,onError:(message?:string)=>void){this.engine=engine;this.makeUtterance=makeUtterance;this.onSpeaking=onSpeaking;this.onError=onError;}
 setLanguage(language:string){this.language=language==='auto'?'en':language;}
 setEnabled(enabled:boolean){this.enabled=enabled;if(!enabled)this.stop();}
 stop(){this.generation++;this.stopped=true;this.queued=0;this.engine.cancel();this.onSpeaking(false);}
 beginTurn(){this.stop();this.stopped=false;}
 enqueue(text:string){
  if(!this.enabled||this.stopped||!text.trim())return;
  const id=this.generation;const utterance=this.makeUtterance(text);utterance.lang=this.language;utterance.rate=.96;const voices=this.engine.getVoices?.();if(voices){const voice=voices.find(v=>v.lang.toLowerCase()===this.language.toLowerCase())||voices.find(v=>v.lang.split('-')[0].toLowerCase()===this.language.split('-')[0].toLowerCase());if(!voice){this.onError(`No ${this.language} voice is installed on this device. Captions are available; choose another language or install a matching system voice.`);return;}utterance.voice=voice;}this.queued++;
  utterance.onstart=()=>{if(id===this.generation&&!this.stopped)this.onSpeaking(true);};
  utterance.onend=()=>{if(id===this.generation){this.queued=Math.max(0,this.queued-1);if(!this.queued)this.onSpeaking(false);}};
  utterance.onerror=()=>{if(id===this.generation){this.stop();this.onError();}};
  try{this.engine.speak(utterance);}catch{if(id===this.generation){this.stop();this.onError();}}
 }
}
