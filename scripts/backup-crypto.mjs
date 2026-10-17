import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
const magic=Buffer.from('HIKBACKUP1');
function keyFrom(value) {
  if(!/^[a-f0-9]{64}$/i.test(value??''))throw Error('BACKUP_ENCRYPTION_KEY must be 32 random bytes encoded as 64 hex characters');
  return Buffer.from(value,'hex');
}
export function encryptBackup(plaintext,key) {
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyFrom(key),nonce);
  cipher.setAAD(magic);
  const encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  return Buffer.concat([magic,nonce,cipher.getAuthTag(),encrypted]);
}
export function decryptBackup(encrypted,key) {
  if(encrypted.length<38||!encrypted.subarray(0,10).equals(magic))throw Error('Invalid backup format');
  const decipher=createDecipheriv('aes-256-gcm',keyFrom(key),encrypted.subarray(10,22));
  decipher.setAAD(magic);decipher.setAuthTag(encrypted.subarray(22,38));
  return Buffer.concat([decipher.update(encrypted.subarray(38)),decipher.final()]);
}
