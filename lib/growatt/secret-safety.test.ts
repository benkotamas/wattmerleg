import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("repository secret safety", () => {
  it("a Growatt token példaváltozója üres", () => {
    const example = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
    expect(example.match(/^GROWATT_API_TOKEN=(.*)$/m)?.[1].trim()).toBe("");
  });
});
