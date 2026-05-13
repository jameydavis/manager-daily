import { describe, expect, it } from "vitest";
import { authUserDisplayLabel } from "./authTypes.js";

describe("authUserDisplayLabel", () => {
  it("prefers first + last name else email", () => {
    expect(
      authUserDisplayLabel({
        id: 1,
        email: "a@b.co",
        firstName: "Ada",
        lastName: "Lovelace",
      })
    ).toBe("Ada Lovelace");
    expect(
      authUserDisplayLabel({
        id: 2,
        email: "only@email.com",
        firstName: null,
        lastName: null,
      })
    ).toBe("only@email.com");
  });
});
