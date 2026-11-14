'use client';
import {useSyncExternalStore} from 'react';
let now=0;const clockListeners=new Set<()=>void>();let timer:ReturnType<typeof setInterval>|null=null;
function subscribeClock(fn:()=>void){clockListeners.add(fn);const tick=()=>{now=Date.now();for(const f of clockListeners)f();};if(!timer){queueMicrotask(tick);timer=setInterval(tick,60000);}return()=>{clockListeners.delete(fn);if(!clockListeners.size&&timer){clearInterval(timer);timer=null;}};}
export function useClock(){return useSyncExternalStore(subscribeClock,()=>now,()=>0);}
function subscribeSpeech(fn:()=>void){window.speechSynthesis?.addEventListener('voiceschanged',fn);return()=>window.speechSynthesis?.removeEventListener('voiceschanged',fn);}
export function useSpeechAvailable(){return useSyncExternalStore(subscribeSpeech,()=>typeof window!=='undefined'&&'speechSynthesis' in window&&'SpeechSynthesisUtterance' in window,()=>false);}
