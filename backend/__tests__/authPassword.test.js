const { hashPassword, verifyPassword, hashResetToken, generateResetToken } = require("../src/auth/password");

describe("auth password helpers", () => {
  test("hashPassword and verifyPassword round-trip", async () => {
    const hash = await hashPassword("SecretPass1!");
    expect(await verifyPassword("SecretPass1!", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  test("reset token hashing is deterministic", () => {
    const token = generateResetToken();
    expect(hashResetToken(token)).toEqual(hashResetToken(token));
    expect(hashResetToken(token)).not.toEqual(hashResetToken(generateResetToken()));
  });
});
