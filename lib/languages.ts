export const languages=[['auto','Auto-detect'],['en','English'],['ru','Русский'],['kk','Қазақша'],['es','Español'],['fr','Français'],['de','Deutsch'],['pt','Português'],['ar','العربية'],['zh','中文'],['hi','हिन्दी'],['tr','Türkçe'],['ja','日本語'],['ko','한국어'],['uk','Українська']] as const;
export type Language=typeof languages[number][0];
export function validLanguage(value:unknown):value is Language{return languages.some(([code])=>code===value);}
export function speechLocale(code:string){return ({en:'en-US',ru:'ru-RU',kk:'kk-KZ',es:'es-ES',fr:'fr-FR',de:'de-DE',pt:'pt-PT',ar:'ar-SA',zh:'zh-CN',hi:'hi-IN',tr:'tr-TR',ja:'ja-JP',ko:'ko-KR',uk:'uk-UA'} as Record<string,string>)[code]||code;}
