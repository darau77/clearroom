/** Per-record IndexedDB transactions prevent stale tabs from replacing entire collections. */
export const stores=['sessions','drills','partners','drafts','settings'] as const;
export type StoreName=typeof stores[number];
export type Row<T>={id:string;value:T;revision:number;deleted?:boolean};
let connection:Promise<IDBDatabase>|undefined;
function request<T>(r:IDBRequest<T>){return new Promise<T>((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function completed(tx:IDBTransaction){return new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Storage transaction interrupted.'));});}
export function openDB(){
 if(!connection)connection=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('clearroom.practice',1);r.onupgradeneeded=()=>{for(const name of stores)if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>{connection=undefined;reject(r.error);};r.onblocked=()=>reject(new Error('Close an older Clearroom tab and retry.'));});
 return connection;
}
export async function allRecords<T>(name:StoreName):Promise<Row<T>[]>{const db=await openDB();const tx=db.transaction(name,'readonly');const done=completed(tx);const rows=await request(tx.objectStore(name).getAll()) as Row<T>[];await done;return rows.filter(r=>!r.deleted);}
export class PracticeCleared extends Error {constructor(){super('Practice was cleared in another tab. Start a new attempt.');}}
export class StorageConflict extends Error {constructor(){super('This partner was changed in another tab. Reopen it before saving your changes.');}}
export async function saveRecord<T extends {id:string}>(name:StoreName,value:T,expectedRevision?:number,expectedEpoch?:number):Promise<Row<T>> {
 const db=await openDB();const tx=db.transaction(name==='settings'?['settings']:[name,'settings'],'readwrite');const done=completed(tx);const store=tx.objectStore(name);if(expectedEpoch!==undefined){const epoch=await request(tx.objectStore('settings').get('clearedAt'));if((epoch?.value||0)!==expectedEpoch){tx.abort();await done.catch(()=>{});throw new PracticeCleared();}}const old=await request(store.get(value.id)) as Row<T>|undefined;
 if(expectedRevision!==undefined&&(old?.revision||0)!==expectedRevision){tx.abort();await done.catch(()=>{});throw new StorageConflict();}
 if((name==='sessions'||name==='drills')&&old){await done;return old;}
 const row={id:value.id,value,revision:(old?.revision||0)+1};store.put(row);await done;return row;
}
export async function deleteRecord(name:StoreName,id:string){const db=await openDB();const tx=db.transaction(name,'readwrite');const done=completed(tx);const store=tx.objectStore(name);const old=await request(store.get(id)) as Row<unknown>|undefined;store.put({id,value:null,deleted:true,revision:(old?.revision||0)+1});await done;}
export async function clearPractice(){const db=await openDB();const tx=db.transaction(['sessions','drills','drafts','settings'],'readwrite');const done=completed(tx);for(const name of ['sessions','drills','drafts'])tx.objectStore(name).clear();tx.objectStore('settings').put({id:'clearedAt',value:Date.now(),revision:1});await done;}
export async function migrateLegacy(){
 const db=await openDB();const tx=db.transaction([...stores],'readwrite');const done=completed(tx);const settings=tx.objectStore('settings');const migrated=await request(settings.get('migrated'));
 if(migrated){await done;return;}
 for(const [key,storeName] of [['clearroom.sessions.v1','sessions'],['clearroom.drills.v1','drills'],['clearroom.partners.v1','partners']] as const){let values:unknown=[];try{values=JSON.parse(localStorage.getItem(key)||'[]');}catch{}if(Array.isArray(values))for(const value of values){if(value&&typeof value.id==='string')tx.objectStore(storeName).put({id:value.id,value,revision:1});}}
 for(const key of ['clearroom.profile','clearroom.dailyGoal']){try{const value=JSON.parse(localStorage.getItem(key)||'null');if(value!==null)settings.put({id:key,value,revision:1});}catch{}}
 settings.put({id:'migrated',value:true,revision:1});await done;
}
