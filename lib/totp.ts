// RFC 6238: SHA-1, six digits, 30-second steps (authenticator interoperability).
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes:Uint8Array) {
 let value=0,bits=0,result='';
 for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){bits-=5;result+=alphabet[(value>>>bits)&31];}}
 if(bits)result+=alphabet[(value<<(5-bits))&31];
 return result;
}
function decode(secret:string) {
 let value=0,bits=0;const bytes:number[]=[];
 for(const char of secret){const n=alphabet.indexOf(char);if(n<0)throw Error('Invalid TOTP secret');value=(value<<5)|n;bits+=5;if(bits>=8){bits-=8;bytes.push((value>>>bits)&255);}}
 return new Uint8Array(bytes);
}
export async function totp(secret:string,step:number,digits=6) {
 const counter=new Uint8Array(8);new DataView(counter.buffer).setBigUint64(0,BigInt(step));
 const key=await crypto.subtle.importKey('raw',decode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);
 const hash=new Uint8Array(await crypto.subtle.sign('HMAC',key,counter));
 const offset=hash[hash.length-1]&15;
 return String((new DataView(hash.buffer).getUint32(offset)&0x7fffffff)%10**digits).padStart(digits,'0');
}
export async function matchTotp(secret:string,code:string,now=Date.now()) {
 if(!/^\d{6}$/.test(code))return null;
 const step=Math.floor(now/30000);
 for(const candidate of [step,step-1,step+1])if(await totp(secret,candidate)===code)return candidate;
 return null;
}
