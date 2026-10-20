export type Setpoint={ time:string; temperature:number };
export type WeeklyProgram=Setpoint[][];
export const DAYS=["Hétfő","Kedd","Szerda","Csütörtök","Péntek","Szombat","Vasárnap"];
export const DEFAULT_DAY:Setpoint[]=[
 {time:"00:00",temperature:21},{time:"06:00",temperature:21.5},
 {time:"08:00",temperature:20.5},{time:"16:00",temperature:21.5},
 {time:"22:30",temperature:21.5}
];
export function defaultWeekly():WeeklyProgram {return DAYS.map(()=>DEFAULT_DAY.map(x=>({...x})))}
const minutes=(time:string)=>{const match=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);return match?Number(match[1])*60+Number(match[2]):NaN};
export function validateWeekly(value:unknown):value is WeeklyProgram {
 if(!Array.isArray(value)||value.length!==7)return false;
 return value.every(day=>Array.isArray(day)&&day.length>=1&&day.length<=7&&day.every((p:unknown,i:number)=>{
  if(!p||typeof p!=="object")return false;
  const point=p as Partial<Setpoint>;
  if(typeof point.time!=="string"||typeof point.temperature!=="number"||!Number.isFinite(point.temperature))return false;
  const t=minutes(point.time);
  return Number.isFinite(t)&&t%10===0&&point.temperature>=5&&point.temperature<=35&&point.temperature*2===Math.round(point.temperature*2)&&
    (i===0?t===0:t>minutes(day[i-1].time));
 }));
}
export function setpointAt(program:WeeklyProgram,day:number,time:string):number|null {
 const selected=program[day]; if(!selected)return null;const t=minutes(time);
 let value:number|null=null;for(const p of selected){if(minutes(p.time)<=t)value=p.temperature;else break}
 return value;
}
