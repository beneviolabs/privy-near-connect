import { describe, expect, it } from "vitest";

import { createPrivyNearExecutor } from "../src/executor";
import { initPrivySignPage } from "../src/sign-page";

describe("privy-near-connect exports", () => {
  it("exposes an executor factory", () => {
    expect(typeof createPrivyNearExecutor).toBe("function");
  });

  it("exposes a sign page initializer", () => {
    const result = initPrivySignPage();
    expect(result).toHaveProperty("sign");
  });
});
