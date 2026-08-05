import{readFileSync}from"node:fs";
import{describe,expect,it}from"vitest";

const source=readFileSync("app/api/heating/analysis/route.ts","utf8");

describe("heating analysis API aggregation contract",()=>{
  it("explicitly scopes model, features and related rows to the authenticated user",()=>{expect(source.match(/\.eq\("user_id",user\.id\)/g)).toHaveLength(4)});
  it("loads only the latest model version features and returns calculationSummary",()=>{expect(source).toContain('.eq("model_version",model.model_version)');expect(source).toContain("heatingCalculationSummary");expect(source).toContain("calculationSummary")});
  it("derives the summary instead of embedding a literal result object",()=>expect(source).not.toMatch(/calculationSummary\s*=\s*\{/));
});
