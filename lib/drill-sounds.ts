/** Original synthesized cues. No downloaded recordings or third-party audio. */
export class DrillSounds {
 private context:AudioContext|null=null;
 async play(kind:'correct'|'retry'|'complete'|'tap'){
  try{
   if(!this.context)this.context=new AudioContext();
   if(this.context.state==='suspended')await this.context.resume();
   const notes=kind==='complete'?[523.25,659.25,783.99,1046.5]:kind==='correct'?[659.25,880]:kind==='retry'?[392,349.23]:[520];
   const now=this.context.currentTime;
   notes.forEach((frequency,index)=>{const oscillator=this.context!.createOscillator();const gain=this.context!.createGain();const start=now+index*.11;oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(kind==='tap'?.018:.045,start+.015);gain.gain.exponentialRampToValueAtTime(.001,start+.18);oscillator.connect(gain);gain.connect(this.context!.destination);oscillator.start(start);oscillator.stop(start+.2);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};});
  }catch{/* Visual feedback remains available when audio is blocked. */}
 }
 close(){void this.context?.close().catch(()=>{});this.context=null;}
}
