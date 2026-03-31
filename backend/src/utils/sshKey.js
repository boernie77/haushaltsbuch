const { execSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

/**
 * Generates an Ed25519 SSH key pair using ssh-keygen.
 * Returns:
 *   privateKey — OpenSSH PEM format ("-----BEGIN OPENSSH PRIVATE KEY-----")
 *   publicKey  — authorized_keys format ("ssh-ed25519 AAAA... comment")
 */
function generateSshKeyPair() {
  const keyPath = path.join(os.tmpdir(), `hb_backup_key_${Date.now()}`);
  try {
    execSync(`ssh-keygen -t ed25519 -f "${keyPath}" -N "" -C "haushaltsbuch-backup"`, { stdio: 'pipe' });
    const privateKey = fs.readFileSync(keyPath, 'utf8');
    const publicKey  = fs.readFileSync(`${keyPath}.pub`, 'utf8').trim();
    return { privateKey, publicKey };
  } finally {
    try { fs.unlinkSync(keyPath); }       catch {}
    try { fs.unlinkSync(`${keyPath}.pub`); } catch {}
  }
}

module.exports = { generateSshKeyPair };
