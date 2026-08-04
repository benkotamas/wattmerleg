import{EonGmailError}from"./errors";
export type EonGmailConfig = { clientId:string; clientSecret:string; refreshToken:string; expectedAddress:string; allowedFrom:string; query:string; credentialVersion:string; maxWorkbookDays:number; maxPeriodLagDays:number };
const invalid=(value:string)=>!value||value==="[SENSITIVE]"||value.startsWith("YOUR_");
const required=(value:string|undefined)=>{const result=value?.trim()??"";if(invalid(result))throw new EonGmailError("EON_GMAIL_NOT_CONFIGURED",503,false);return result};
const boundedInt=(value:string|undefined,fallback:number,max:number)=>{const parsed=Number(value??fallback);if(!Number.isInteger(parsed)||parsed<0||parsed>max)throw new EonGmailError("EON_GMAIL_NOT_CONFIGURED",503,false);return parsed};
export function gmailConfig(env:NodeJS.ProcessEnv=process.env):EonGmailConfig{
 const query=required(env.GMAIL_EON_QUERY);if(query.length>500||/[\r\n]/.test(query))throw new EonGmailError("EON_GMAIL_NOT_CONFIGURED",503,false);
 const allowedFrom=required(env.GMAIL_EON_ALLOWED_FROM).toLowerCase();if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(allowedFrom))throw new EonGmailError("EON_GMAIL_NOT_CONFIGURED",503,false);
 return{clientId:required(env.GMAIL_CLIENT_ID),clientSecret:required(env.GMAIL_CLIENT_SECRET),refreshToken:required(env.GMAIL_REFRESH_TOKEN),expectedAddress:required(env.GMAIL_EXPECTED_ADDRESS).toLowerCase(),allowedFrom,query,credentialVersion:required(env.GMAIL_CREDENTIAL_VERSION),maxWorkbookDays:boundedInt(env.GMAIL_EON_MAX_WORKBOOK_DAYS,7,31),maxPeriodLagDays:boundedInt(env.GMAIL_EON_MAX_PERIOD_LAG_DAYS,14,90)};
}
export const eonOwnerId=(env:NodeJS.ProcessEnv=process.env)=>env.EON_ALLOWED_USER_ID?.trim()||env.GROWATT_ALLOWED_USER_ID?.trim()||"";
export function gmailConfigured(env:NodeJS.ProcessEnv=process.env){try{gmailConfig(env);return Boolean(eonOwnerId(env))}catch{return false}}
