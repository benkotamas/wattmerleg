import{EonGmailError}from"./errors";
export type GmailHeader={name?:string;value?:string};
export function senderAddress(headers:GmailHeader[]|undefined,allowed:string){if(!headers||headers.length>10||JSON.stringify(headers).length>4096)throw new EonGmailError("EON_GMAIL_SENDER_REJECTED",422);const from=headers.filter(h=>h.name?.toLowerCase()==="from");if(from.length!==1||!from[0].value||from[0].value.length>320)throw new EonGmailError("EON_GMAIL_SENDER_REJECTED",422);const value=from[0].value.trim(),angle=value.match(/<([^<>]+)>$/),address=(angle?.[1]??value).trim().toLowerCase();if(address!==allowed.toLowerCase())throw new EonGmailError("EON_GMAIL_SENDER_REJECTED",422);return true}
export const constrainedQuery=(query:string,allowed:string)=>`(${query}) from:${allowed} -in:spam`;
