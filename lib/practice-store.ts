'use client';
import { useSyncExternalStore } from 'react';
import { allRecords, migrateLegacy, saveRecord, deleteRecord, clearPractice, type StoreName } from './practice-db';
import type { Session, Scenario, Profile, Message } from './practice';
import type { DrillSession } from './drills';
import type { CustomPartner } from './custom-partners';
export type Draft={id:string;date:string;scenario:Scenario;profile:Profile;messages:Message[];input:string;experience:'call'|'chat';language:string;seconds:number;epoch?:number;lessonId?:string;revision?:number};
type Snapshot={ready:boolean;error:string;sessions:Session[];drills:DrillSession[];partners:CustomPartner[];drafts:Draft[];settings:Record<string,unknown>};
const empty:Snapshot={ready:false,error:'',sessions:[],drills:[],partners:[],drafts:[],settings:{}};
let snapshot=empty;let starting:Promise<void>|null=null;let channel:BroadcastChannel|null=null;let refreshSequence=0;
const listeners=new Set<()=>void>();
function emit(){for(const listener of listeners)listener();}
async function refresh(){const sequence=++refreshSequence;try{const [sessions,drills,partners,drafts,settings]=await Promise.all([allRecords<Session>('sessions'),allRecords<DrillSession>('drills'),allRecords<CustomPartner>('partners'),allRecords<Draft>('drafts'),allRecords<unknown>('settings')]);if(sequence!==refreshSequence)return;const previousEpoch=snapshot.settings.clearedAt;const wasReady=snapshot.ready;snapshot={ready:true,error:'',sessions:sessions.map(r=>r.value).filter(s=>s?.feedback&&typeof s.scenario==='string').sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)),drills:drills.map(r=>r.value),partners:partners.map(r=>({...r.value,revision:r.revision})),drafts:drafts.map(r=>({...r.value,revision:r.revision})).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)),settings:Object.fromEntries(settings.map(r=>[r.id,r.value]))};emit();if(wasReady&&previousEpoch!==snapshot.settings.clearedAt)window.dispatchEvent(new Event('clearroom:cleared'));}catch{snapshot={...snapshot,ready:true,error:'Browser storage is unavailable. Leave this tab open to keep your work.'};emit();}}
export function readyStore(){if(!starting){starting=(async()=>{try{await migrateLegacy();}catch{}await refresh();if(typeof BroadcastChannel!=='undefined'){channel=new BroadcastChannel('clearroom.practice.v2');channel.onmessage=()=>void refresh();}window.addEventListener('focus',()=>void refresh());})();}return starting;}
function subscribe(listener:()=>void){listeners.add(listener);void readyStore();return()=>{listeners.delete(listener);};}
export function usePracticeStore(){return useSyncExternalStore(subscribe,()=>snapshot,()=>empty);}
export function currentStore(){return snapshot;}
async function changed(){await refresh();channel?.postMessage('changed');}
export async function saveItem<T extends {id:string}>(name:StoreName,value:T,revision?:number,epoch?:number){const row=await saveRecord(name,value,revision,epoch??(name==='drafts'||name==='sessions'||name==='drills'?Number(snapshot.settings.clearedAt||0):undefined));await changed();return row;}
export async function removeItem(name:StoreName,id:string){await deleteRecord(name,id);await changed();}
export async function clearSavedPractice(){await clearPractice();await changed();}
export async function setting(id:string,value:unknown){await saveRecord('settings',{id,data:value});/* Settings store values are primitives, while normal records are objects. */await changed();}
export function settingValue<T>(name:string,fallback:T):T{const value=snapshot.settings[name];return value&&typeof value==='object'&&'data' in value?(value as {data:T}).data:(value as T)??fallback;}
