import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const source=readFileSync("components/eon/interval-import-card.tsx","utf8");
describe("E.ON importelőzmény UI",()=>{
  it("megjeleníti a napállapotokat, warningokat és számlálókat",()=>{for(const field of["complete_days","provisional_days","incomplete_days","warning_codes","inserted_rows","updated_rows","unchanged_rows"])expect(source).toContain(field)});
  it("Europe/Budapest szerint formázza az import időpontját",()=>{expect(source).toContain('timeZone:"Europe/Budapest"');expect(source).toContain("budapestImportInstant(x.created_at)")});
  it("nem jeleníti meg az érzékeny batch-mezőket",()=>{expect(source).not.toContain("attachment_sha256");expect(source).not.toContain("external_message_id")});
});
