import sodium from "libsodium-wrappers";

export type EncryptedSecretPayload = {
  encrypted_value: string;
  key_id: string;
};

/** Encrypt a secret value for GitHub Actions using the scope public key. */
export async function encryptSecretForGithub(
  publicKeyBase64: string,
  keyId: string,
  secretValue: string,
): Promise<EncryptedSecretPayload> {
  await sodium.ready;
  const keyBytes = sodium.from_base64(publicKeyBase64, sodium.base64_variants.ORIGINAL);
  const messageBytes = sodium.from_string(secretValue);
  const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes);
  return {
    encrypted_value: sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL),
    key_id: keyId,
  };
}
