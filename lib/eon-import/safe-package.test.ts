import {execFileSync,spawnSync} from "node:child_process";
import {existsSync,mkdtempSync,readFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {describe,expect,it} from "vitest";

describe("safe package",()=>{it("a fájlnevek mellett a szöveges tartalmat is secret-mintákra vizsgálja",()=>{
  expect(spawnSync("git",["check-ignore",".env.example"]).status).toBe(1);
  const dir=mkdtempSync(join(tmpdir(),"eon-safe-")),zip=join(dir,"safe.zip");
  try{
    execFileSync(process.execPath,["scripts/pack-safe.mjs",zip]);
    const names=execFileSync("tar",["-tf",zip],{encoding:"utf8"}).replaceAll("\\","/");
    expect(names).toMatch(/(^|\/)\.env\.example\r?$/m);expect(names).not.toMatch(/\.env\.local|data\/.*\.xlsx|\.zip\r?$/mi);
    const textNames=names.split(/\r?\n/).filter(name=>/\.(?:ts|tsx|js|mjs|json|md|sql|css|txt|example|gitignore)$/.test(name));
    const contents=textNames.map(name=>execFileSync("tar",["-xOf",zip,name],{encoding:"utf8",maxBuffer:20*1024*1024})).join("\n");
    expect(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/.test(contents)).toBe(false);
    expect(/\bHU[A-Z0-9]{20,}\b/.test(contents)).toBe(false);
    const unsafeAssignment=contents.split(/\r?\n/).some(line=>{const match=line.match(/^(GROWATT_API_TOKEN|(?:EON|GMAIL)_[A-Z0-9_]+)=(.*)$/);if(!match)return false;const value=match[2].trim();return Boolean(value&&!value.startsWith("YOUR_")&&value!=="[SENSITIVE]")});
    expect(unsafeAssignment).toBe(false);
    if(existsSync(".env.local")){const localValues=readFileSync(".env.local","utf8").split(/\r?\n/).map(line=>line.match(/^([A-Z0-9_]+)=(.+)$/)).filter(match=>match&&/(TOKEN|SECRET|PASSWORD|SERVICE_ROLE|EON|GMAIL|EMAIL)/.test(match[1])).map(match=>match?.[2].trim()).filter((value):value is string=>Boolean(value&&value!=="[SENSITIVE]"&&value.length>=6));expect(localValues.some(value=>contents.includes(value))).toBe(false)}
  }finally{rmSync(dir,{recursive:true,force:true})}
},20000)});
