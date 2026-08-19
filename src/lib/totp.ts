import * as OTPAuth from "otpauth";

export function generateTotpSecret() {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function totp(secret: string, label: string) {
  return new OTPAuth.TOTP({
    issuer: "Pharmacy",
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

export function totpUri(secret: string, label: string) {
  return totp(secret, label).toString();
}

export function verifyTotpCode(secret: string, code: string) {
  const delta = totp(secret, "verify").validate({ token: code.trim(), window: 1 });
  return delta !== null;
}
