'use client';
import { PartnerAvatar } from './partner-avatar';
import type { AvatarLook } from '../lib/custom-partners';
export function DrillGuide({partner,look,message,mood='ready',compact=false}:{partner:string;look?:AvatarLook;message:string;mood?:'ready'|'happy'|'thinking';compact?:boolean}){
 return <div className={'drill-guide buddy-'+mood+(compact?' compact':'')}><div className="drill-guide-portrait"><PartnerAvatar partner={partner} look={look}/><span className="buddy-spark" aria-hidden="true">✦</span></div><div className="drill-guide-message"><small>YOUR PRACTICE GUIDE</small><p>{message}</p></div></div>;
}
