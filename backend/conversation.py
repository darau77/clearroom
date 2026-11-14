"""Bounded, speaker-attributed context and model-independent validation."""
import json
import re
from difflib import SequenceMatcher
from policy import SCENARIOS
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal

Language = Literal['auto','en','ru','kk','es','fr','de','pt','ar','zh','hi','tr','ja','ko','uk']
LANGUAGES = {'en':'English','ru':'Russian','kk':'Kazakh','es':'Spanish','fr':'French','de':'German','pt':'Portuguese','ar':'Arabic','zh':'Chinese','hi':'Hindi','tr':'Turkish','ja':'Japanese','ko':'Korean','uk':'Ukrainian'}
class Evidence(BaseModel):
    model_config=ConfigDict(extra='forbid')
    turn: int = Field(ge=1,le=26)
    quote: str = Field(min_length=3,max_length=400)
    owner: Literal['LEARNER','PARTNER','OTHER']
    action: str = Field(min_length=1,max_length=240)
    status: Literal['proposed','agreed','completed','unclear']
class PlannedReply(BaseModel):
    partner_position: str = Field(min_length=1,max_length=300)
    latest_user_need: str = Field(min_length=1,max_length=300)
    language: Language
    responsibilities: list[Evidence] = Field(default_factory=list,max_length=6)
    reply: str = Field(min_length=1,max_length=1600,description='Only the actual words spoken by the fictional partner. No narration, character name prefix, stage directions, or words spoken by the human.')
class ReviewedReply(BaseModel):
    problem: Literal['none','wrong_speaker','repetition','deflection','invented_facts','language']
    reason: str = Field(min_length=1,max_length=400)
    language: Language
    reply: str = Field(min_length=1,max_length=1600,description='Only the fictional PARTNER speaking to the human. Never write the human response. No narration or stage directions.')
    ownership_checked: bool
    language_checked: bool


def transcript(messages):
    return [{'turn':i+1,'speaker':'LEARNER' if m.role=='user' else 'PARTNER','text':m.content} for i,m in enumerate(messages)]

def explicit_language(messages, selected='auto'):
    aliases={'en':r'english|английск\w*|ағылшын\w*','ru':r'russian|русск\w*|орысша','kk':r'kazakh|қазақ\w*|казахск\w*','es':r'spanish|español|испанск\w*','fr':r'french|français|французск\w*','de':r'german|deutsch|немецк\w*','pt':r'portuguese|português','ar':r'arabic|العربية','zh':r'chinese|中文','hi':r'hindi|हिन्दी','tr':r'turkish|türkçe','ja':r'japanese|日本語','ko':r'korean|한국어','uk':r'ukrainian|українськ\w*'}
    candidates=messages if selected=='auto' else (messages[-1:] if messages and messages[-1].role=='user' else [])
    for m in reversed(candidates):
        if m.role!='user':continue
        text=m.content.lower()
        # A request to change language is allowed; it never changes character identity.
        request=bool(re.search(r'respond|reply|answer|speak|switch|continue|in\s+\w+\s+please|говор|ответ|отвеч|давай|язык|сөйле|жауап|перей|жаз|қазақша|по-русски',text))
        if request:
            for code,pattern in aliases.items():
                if re.search(pattern,text):return code
    return selected

def validate_evidence(items,messages,learner_only=False):
    valid=[]
    for e in items:
        if e.turn>len(messages):continue
        source=messages[e.turn-1]
        if e.quote not in source.content:continue
        if learner_only and (source.role!='user' or e.owner!='LEARNER'):continue
        valid.append(e)
    return valid

def normalise(text):
    return re.sub(r'\W+','',text.casefold())

def validate_history_claims(reply,messages,situation=''):
    """Reject known forms of invented history; this is not a full fact checker.

    Earlier AI lines cannot establish unprovided prior meetings or warnings.
    The supplied situation and the human's own words can establish them.
    """
    source=situation+'\n'+'\n'.join(m.content for m in messages if m.role=='user')
    checks=[
        (r"(?:we(?:['’]ve| have| already)?\s+(?:discussed|talked|spoken)|as (?:we|i) (?:discussed|said)|i(?:['’]ve| have) (?:already )?warned)",
         r'\b(?:discussed|talked|spoke|warned|warnings?|previous conversations?)\b',
         'a previous discussion or warning'),
        (r"(?:there(?:['’]s| has) been no improvement|you (?:haven['’]t|have not) (?:shown (?:any )?improvement|improved))",
         r'\b(?:no improvement|not improved|failed to improve|warnings?|warned)\b',
         'a failed improvement period'),
        (r'\b(?:мы уже обсуждали|я уже предупреждал|вам уже давали предупреждения)\b',
         r'обсуждал|говорили|предупрежд',
         'a previous discussion or warning'),
    ]
    for claim,evidence,label in checks:
        if re.search(claim,reply,re.I) and not re.search(evidence,source,re.I):
            raise ValueError('The reply invents '+label+' that is absent from the situation and human statements. State the current position without inventing past incidents.')

def repeated_partner_reply(reply, messages):
    """Catch copies, not semantic similarity: shared facts are often necessary."""
    latest=next((m.content for m in reversed(messages) if m.role=='user'),'')
    # Repeating on request and confirming a plan are legitimate dialogue acts.
    request=r'(?:please\s+)?(?:repeat\b|confirm\b|translate\b|say (?:that|it) again)|(?:can|could|would) you (?:please )?(?:repeat\b|confirm\b|translate\b|say (?:that|it) again)|(?:повтори(?:те)?|подтверди|переведи|қайтала|repite|répète|wiederhole)\b'
    if re.search(r'(?:^|[.!?]\s*)\s*(?:'+request+')',latest,re.I):
        return False
    words=re.findall(r'\w+',reply.casefold())
    compact=normalise(reply)
    for previous in [m.content for m in messages if m.role=='assistant'][-4:]:
        old=re.findall(r'\w+',previous.casefold())
        # Short acknowledgements are allowed, but long verbatim loops are not.
        short_ack=len(words)<=6 and bool(re.match(r'^(yes|no|okay|ok|agreed|sure|right|да|нет|хорошо)\b',reply,re.I))
        if compact==normalise(previous) and not short_ack and (len(words)>=4 or len(compact)>=18):
            return True
        if len(words)>=8 and len(old)>=8:
            size=min(len(words),len(old))/max(len(words),len(old))
            comparison=SequenceMatcher(None,old,words,autojunk=False)
            if size>=.72 and comparison.ratio()>=.82:
                # Only cosmetic edits are hard-blocked. Names, task verbs, owners
                # and dates can change meaning even when all other words match.
                cosmetic=set('a an the to of for in on at about it that this is am are be been being have has need m really just still okay ok well so and but focus focused focusing talk talking discuss discussing'.split())
                changed=[token for op,a,b,x,y in comparison.get_opcodes() if op!='equal' for token in old[a:b]+words[x:y]]
                if changed and all(token in cosmetic for token in changed):return True
    return False

def validate_reply(reply, messages, language):
    if not reply.strip():raise ValueError('Empty response')
    if messages and messages[-1].role=='user' and normalise(reply)==normalise(messages[-1].content):
        raise ValueError('The partner echoed the learner instead of replying')
    if repeated_partner_reply(reply,messages):
        raise ValueError('The partner repeated an earlier reply instead of answering the latest turn')
    # Catch clear wrong-script responses; Latin-script language distinctions are audited by Qwen.
    letters=[c for c in reply if c.isalpha()]
    if len(letters)>=12:
        cyr=sum('\u0400'<=c<='\u052f' for c in letters)/len(letters)
        if language in ('ru','kk','uk') and cyr<.45:raise ValueError('Reply is not in the requested language')
        if language in ('en','es','fr','de','pt','tr') and cyr>.3:raise ValueError('Reply is not in the requested language')

def context_data(c):
    character=c.custom_partner.model_dump() if c.custom_partner else {**SCENARIOS[c.scenario]}
    if not c.custom_partner:
        character['context']=re.sub(r'\byour\b',"PARTNER's",character['context'],flags=re.I)
        character['context']=re.sub(r'\byou\b','PARTNER',character['context'],flags=re.I)
    return json.dumps({'speaker_key':{'LEARNER':('human user, the manager talking to '+character['name'] if not c.custom_partner else 'human user talking to their '+c.custom_partner.relationship)+', the ONLY person being coached','PARTNER':character['name']+', fictional character, NEVER the person being coached'},'character':character,'previous_practice':transcript(c.memory),'current_transcript':transcript(c.messages)},ensure_ascii=False)
