import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";
export interface VoucherEncryptionKey { id: string; key: Buffer }
const alphabet="23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function checkKey(key:VoucherEncryptionKey) { if(!/^[A-Za-z0-9_-]{1,32}$/.test(key.id)||key.key.length!==32) throw new Error("Invalid voucher encryption key"); }
function contextBytes(id:string,context:string) { if(!context||context.length>256) throw new Error("Invalid voucher encryption context");return Buffer.from(`pci:v1:${id}:${context}`,"utf8"); }
function base64(value:string) { if(!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();const bytes=Buffer.from(value,"base64url");if(bytes.toString("base64url")!==value) throw new Error();return bytes; }
export function hashVoucherToken(token:string):string {
  try {if(token.length!==43||base64(token).length!==32) throw new Error();}catch{throw new Error("Invalid voucher token");}
  return createHash("sha256").update(token,"utf8").digest("hex");
}
export function createVoucherCapability(key:VoucherEncryptionKey,context:string) {
  checkKey(key);const token=randomBytes(32).toString("base64url"),iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key.key,iv);
  cipher.setAAD(contextBytes(key.id,context));const encrypted=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
  return {token,hash:hashVoucherToken(token),encryptedToken:["v1",key.id,iv.toString("base64url"),encrypted.toString("base64url"),cipher.getAuthTag().toString("base64url")].join(".")};
}
export function decryptVoucherCapability(envelope:string,keyring:Record<string,Buffer>,context:string):string {
  try {
    const parts=envelope.split(".");if(parts.length!==5||parts[0]!=="v1") throw new Error();
    const [,id,ivText,cipherText,tagText]=parts,key=keyring[id];if(!key) throw new Error();checkKey({id,key});
    const iv=base64(ivText),tag=base64(tagText),encrypted=base64(cipherText);if(iv.length!==12||tag.length!==16||encrypted.length!==43) throw new Error();
    const decipher=createDecipheriv("aes-256-gcm",key,iv);decipher.setAAD(contextBytes(id,context));decipher.setAuthTag(tag);
    const token=Buffer.concat([decipher.update(encrypted),decipher.final()]).toString("utf8");hashVoucherToken(token);return token;
  }catch{throw new Error("Invalid encrypted voucher token");}
}
export function createVoucherShortCode():string { const text=Array.from({length:8},()=>alphabet[randomInt(alphabet.length)]).join("");return `${text.slice(0,4)}-${text.slice(4)}`; }
