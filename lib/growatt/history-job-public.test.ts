import { describe, expect, it } from "vitest";
import { publicGrowattJob } from "./history-jobs";

describe("public Growatt job DTO", () => {
  it("nem ad ki usert, claim tokent vagy lease-t", () => {
    expect(publicGrowattJob({ id: "job", user_id: "owner", claim_token: "secret", lease_expires_at: "later", status: "running" })).toEqual({ id: "job", status: "running" });
  });
});
