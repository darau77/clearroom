'use client';
/** Original vector characters. Mouth movement indicates speech; it is not phoneme lip-sync. */
export function PartnerAvatar({partner,speaking=false}:{partner:string;speaking?:boolean}){
 const jordan=partner==='promotion',sam=partner==='tension';
 const skin=jordan?'#bc815d':sam?'#d4a174':'#edbb97';const hair=jordan?'#3c3029':sam?'#3d3a42':'#514435';const shirt=jordan?'#c4896e':sam?'#9293b8':'#9eb48a';
 return <svg className={'character-avatar '+(speaking?'is-speaking':'')} viewBox="0 0 420 430" role="img" aria-label="Animated AI character"><ellipse cx="210" cy="410" rx="144" ry="17" fill="#203c3520"/><g className="character-body"><path d="M62 430v-51c0-73 55-116 148-116s148 43 148 116v51" fill={shirt}/><path d="M136 287l74 57 74-57-35-12h-78z" fill="#ffffff25"/><path d="M179 230v57q31 42 62 0v-57" fill={skin}/><path d="M180 238q30 27 60 0v23q-30 23-60 0z" fill="#9b60402b"/><path d="M81 429v-60m257 60v-60" stroke="#253b3326" strokeWidth="4"/><path d="M136 287l39 66 35-22 35 22 39-66" fill="none" stroke="#ffffff35" strokeWidth="3"/>
 <g className="character-head"><path d="M119 169v-55q0-84 91-84t91 84v65l-33 54H151z" fill={hair}/>{sam&&<path d="M124 107q-34 57-19 162l43 4 6-139m135-27q34 57 19 162l-43 4-6-139" fill={hair}/>}
 <ellipse cx="122" cy="174" rx="17" ry="24" fill={skin}/><ellipse cx="298" cy="174" rx="17" ry="24" fill={skin}/><path d="M130 111q0-65 80-65t80 65v69c0 61-40 96-80 96s-80-35-80-96z" fill={skin}/>
 {jordan?<path d="M125 139l12-42q52 20 94-24 12 29 57 36l6 32 8-50q-3-65-92-65-91 0-94 69z" fill={hair}/>:sam?<path d="M123 148l-3-49q5-74 90-74 93 3 93 81l-10 55-16-66q-47 15-69-19-17 38-72 39z" fill={hair}/>:<path d="M122 142l-9-56q2-38 28-45-2-24 30-23 27-27 50-8 40-7 53 17 42 8 34 59l-15 64-10-47q-35-5-60-31-22 38-80 33z" fill={hair}/>}
 <path d="M155 151q16-8 32-1m46 0q16-7 31 1" fill="none" stroke={hair} strokeWidth="5" strokeLinecap="round"/>
 <g className="character-eyes"><ellipse cx="172" cy="171" rx="6" ry="8" fill="#333630"/><ellipse cx="248" cy="171" rx="6" ry="8" fill="#333630"/><circle cx="174" cy="168" r="2" fill="#fff"/><circle cx="250" cy="168" r="2" fill="#fff"/></g>
 {jordan&&<g fill="none" stroke="#615147" strokeWidth="3"><rect x="143" y="155" width="56" height="34" rx="11"/><rect x="221" y="155" width="56" height="34" rx="11"/><path d="M199 165q11-7 22 0m-78-4-13-3m147 3 13-3"/></g>}
 <path d="M210 175l-6 27q7 5 14 0" fill="none" stroke="#a76b4c80" strokeWidth="3" strokeLinecap="round"/><ellipse cx="157" cy="204" rx="15" ry="7" fill="#cb80675c"/><ellipse cx="263" cy="204" rx="15" ry="7" fill="#cb80675c"/>
 <path className="character-mouth-rest" d="M190 225q20 13 40 0" fill="none" stroke="#8b5144" strokeWidth="4" strokeLinecap="round"/>
 <g className="character-mouth-talk"><ellipse cx="210" cy="228" rx="17" ry="11" fill="#734136"/><path d="M196 222h28q-1 5-14 5t-14-5" fill="#fff5de"/><ellipse cx="210" cy="235" rx="9" ry="3" fill="#d6927e"/></g>
 </g></g></svg>;
}
