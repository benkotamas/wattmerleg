import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type RequestLike = { method:string;cache:string;url:string };
type Strategy = { CACHE_NAME:string;INSTALL_ASSETS:string[];cacheableStaticRequest:(request:RequestLike,origin:string)=>boolean;obsoleteWattmerlegCaches:(keys:string[])=>string[] };
const context: { WattmerlegSwStrategy?:Strategy; URL:typeof URL } = { URL };
runInNewContext(readFileSync("public/sw-strategy.js","utf8"),context);
const strategy=context.WattmerlegSwStrategy!;
const origin="https://wattmerleg.test";
const request=(path:string,cache="default"):RequestLike=>({method:"GET",cache,url:new URL(path,origin).toString()});

describe("service worker statikus cache-stratégia",()=>{
  it.each(["/api/growatt/latest","/api/weather","/api/solar/monthly-snapshots"])("%s API-t nem cache-el",path=>expect(strategy.cacheableStaticRequest(request(path),origin)).toBe(false));
  it("no-store kérést nem cache-el",()=>expect(strategy.cacheableStaticRequest(request("/_next/static/chunk.js","no-store"),origin)).toBe(false));
  it("verziózott Next static assetet cache-elhet",()=>expect(strategy.cacheableStaticRequest(request("/_next/static/chunks/app-123.js"),origin)).toBe(true));
  it.each(["/icon.svg","/manifest.webmanifest"])("%s publikus assetet cache-elhet",path=>expect(strategy.cacheableStaticRequest(request(path),origin)).toBe(true));
  it.each(["/","/belepes","/feed.json","/?_rsc=abc","/data/user.json"])("%s dinamikus dokumentum/RSC/JSON nincs cache-elve",path=>expect(strategy.cacheableStaticRequest(request(path),origin)).toBe(false));
  it("v2 az új cache és aktiváláskor törlődik a v1, de idegen cache nem",()=>{expect(strategy.CACHE_NAME).toBe("wattmerleg-v2");expect(strategy.obsoleteWattmerlegCaches(["wattmerleg-v1","wattmerleg-v2","other-app-v1"])).toEqual(["wattmerleg-v1"])});
  it("installkor sem kerül auth-függő dokumentum az app shellbe",()=>expect(strategy.INSTALL_ASSETS).toEqual(["/manifest.webmanifest","/icon.svg"]));
  it("a fetch handler API-nál respondWith előtt kilép, ezért nincs HTML fallback",()=>{const source=readFileSync("public/sw.js","utf8");expect(source.indexOf('url.pathname.startsWith("/api/")')).toBeLessThan(source.indexOf("event.respondWith("));expect(source).not.toContain('caches.match("/")')});
});
