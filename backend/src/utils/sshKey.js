const { generateKeyPairSync } = require('crypto');

/**
 * Generates an Ed25519 SSH key pair.
 * Returns:
 *   privateKey — PKCS8 PEM (accepted by ssh2)
 *   publicKey  — OpenSSH authorized_keys format ("ssh-ed25519 AAAA... comment")
 */
function generateSshKeyPair() {
  const { privateKey: privKeyObj, publicKey: pubKeyObj } = generateKeyPairSync('ed25519');

  const privateKey = privKeyObj.export({ type: 'pkcs8', format: 'pem' });

  // SPKI DER for Ed25519 is always 44 bytes; raw key = last 32 bytes
  const spkiDer = pubKeyObj.export({ type: 'spki', format: 'der' });
  const rawKey = spkiDer.slice(-32);

  // OpenSSH wire format: [4-byte len][type][4-byte len][key bytes]
  const keyType = 'ssh-ed25519';
  const typeBuf = Buffer.from(keyType, 'ascii');
  const typeLen = Buffer.allocUnsafe(4); typeLen.writeUInt32BE(typeBuf.length);
  const keyLen  = Buffer.allocUnsafe(4); keyLen.writeUInt32BE(rawKey.length);
  const wire    = Buffer.concat([typeLen, typeBuf, keyLen, rawKey]);

  const publicKey = `${keyType} ${wire.toString('base64')} haushaltsbuch-backup`;
  return { privateKey, publicKey };
}

module.exports = { generateSshKeyPair };
