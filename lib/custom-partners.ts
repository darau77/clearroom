import type { Scenario } from './practice';

export const PARTNERS_STORE = 'clearroom.partners.v1';
export const MAX_PARTNERS = 12;
export const relationships = ['Teammate', 'Manager', 'Direct report', 'Client', 'Friend', 'Family member', 'Partner', 'Roommate'] as const;
export type Relationship = typeof relationships[number];
export type AvatarLook = { style: 'wave' | 'crop' | 'bob'; skin: 'light' | 'medium' | 'deep'; color: 'sage' | 'peach' | 'lavender' };
export type CustomPartner = { revision?:number; id: string; name: string; role: string; relationship: Relationship; personality: string; context: string; objective: string; opening: string; avatar: AvatarLook };
export const emptyPartner: Omit<CustomPartner, 'id'> = { name: '', role: '', relationship: 'Teammate', personality: '', context: '', objective: '', opening: '', avatar: {style:'wave',skin:'medium',color:'sage'} };
const limits = {name:60, role:100, personality:300, context:1200, objective:400, opening:240} as const;
export function partnerError(value: unknown): string | null {
 if(!value || typeof value !== 'object')return 'Add your partner’s details.';
 const p=value as CustomPartner;
 for(const [key,max] of Object.entries(limits)) {
  const v=p[key as keyof typeof limits];
  if(typeof v!=='string'||v.length>max)return `Keep ${key} within ${max} characters.`;
  if(key!=='opening'&&!v.trim())return `Add your partner’s ${key === 'context'?'situation':key === 'objective'?'conversation goal':key}.`;
 }
 if(!relationships.includes(p.relationship))return 'Choose your relationship to this partner.';
 if(!p.avatar || !['wave','crop','bob'].includes(p.avatar.style)||!['light','medium','deep'].includes(p.avatar.skin)||!['sage','peach','lavender'].includes(p.avatar.color))return 'Choose an avatar style.';
 return null;
}
export function readPartners(raw: string | null): CustomPartner[] {
 try {const value=JSON.parse(raw||'[]');if(!Array.isArray(value))return [];const seen=new Set<string>();return value.filter((p):p is CustomPartner=>{if(!p||typeof p.id!=='string'||!/^custom-[a-zA-Z0-9-]{1,80}$/.test(p.id)||seen.has(p.id)||partnerError(p))return false;seen.add(p.id);return true;}).slice(0,MAX_PARTNERS);}catch{return [];}
}
export function partnerScenario(p:CustomPartner):Scenario {
 return {id:p.id,title:`A conversation with ${p.name}`,tag:'Your custom partner',description:p.context,name:p.name,role:p.role,initials:p.name.trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase(),color:p.avatar.color,opening:p.opening.trim()||`Hi, I’m ${p.name}. What would you like to talk through?`,context:p.context,objective:p.objective,tip:'Start with a specific observation, then invite their perspective.',prompts:['I’d like to understand your perspective.','What would a useful next step look like for both of us?'],customPartner:p};
}
export function conversationContext(s:Scenario) {
 if(!s.customPartner)return {scenario:s.id};
 const {name,role,relationship,personality,context,objective,opening}=s.customPartner;
 return {scenario:'custom',custom_partner:{name,role,relationship,personality,context,objective,opening}};
}
