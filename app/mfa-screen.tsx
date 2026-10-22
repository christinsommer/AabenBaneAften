'use client';
import {useEffect,useRef,useState} from 'react';
import QRCode from 'qrcode';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

export type MfaPrompt={stage:'setup'|'verify';secret?:string;uri?:string};
export function MfaScreen({prompt,recoveryCodes,act,busy,error,onContinue}:{prompt:MfaPrompt|null;recoveryCodes:string[]|null;act:(body:Record<string,unknown>)=>Promise<boolean>;busy:boolean;error:string;onContinue:()=>void}) {
 const canvas=useRef<HTMLCanvasElement>(null);
 const [code,setCode]=useState(''),[remember,setRemember]=useState(false),[recovery,setRecovery]=useState(false),[stored,setStored]=useState(false);
 useEffect(()=>{if(prompt?.uri&&canvas.current)void QRCode.toCanvas(canvas.current,prompt.uri,{width:256,margin:2});},[prompt?.uri]);
 return <main className="grid min-h-screen place-items-center bg-[#f4f6fa] px-4 py-8"><section className="w-full max-w-lg space-y-4 rounded-xl border bg-white p-6">
 <h1 className="text-xl font-bold">{recoveryCodes?'Gem dine gendannelseskoder':prompt?.stage==='setup'?'Opsæt 2FA til administratorlogin':'Bekræft dit login'}</h1>
 {error&&<p role="alert" className="text-red-700">{error}</p>}
 {recoveryCodes?<>
 <p>Gem koderne et sikkert sted, fx i din adgangskodeadministrator. Hver kode kan bruges én gang i stedet for appens kode, hvis du mister telefonen. Koderne vises kun nu.</p>
 <ul className="space-y-2 rounded bg-slate-100 p-3 font-mono text-sm [overflow-wrap:anywhere]">{recoveryCodes.map(value=><li key={value}>{value.match(/.{1,8}/g)!.join('-')}</li>)}</ul>
 <label className="flex items-center gap-2"><input type="checkbox" checked={stored} onChange={e=>setStored(e.target.checked)}/>Jeg har gemt mine gendannelseskoder</label>
 <Button disabled={!stored} onClick={onContinue}>Fortsæt</Button>
 </>:<>
 {prompt?.stage==='setup'?<>
 <p>Tilføj en konto i Microsoft Authenticator, Google Authenticator eller en anden TOTP-app. Scan QR-koden og indtast appens sekscifrede kode. Admin og Super Admin skal bruge 2FA.</p>
 <canvas ref={canvas} className="mx-auto max-w-full" aria-label="QR-kode til din authenticator-app"/>
 <details><summary>Opsæt på samme telefon eller indtast nøglen manuelt</summary><p className="mt-2">Vælg tidsbaseret kode (TOTP), 6 cifre og 30 sekunder. Konto: Åben Bane Aften.</p><code className="block break-all rounded bg-slate-100 p-3">{prompt.secret}</code></details>
 </>:<p>Indtast {recovery?'en af dine gemte gendannelseskoder':'den sekscifrede kode fra din authenticator-app'}.</p>}
 <form className="space-y-4" onSubmit={async e=>{e.preventDefault();if(!busy){await act({action:'mfa_verify',code,remember});setCode('');}}}>
 <div className="space-y-2"><Label htmlFor="mfa-code">{recovery?'Gendannelseskode':'Engangskode'}</Label><Input id="mfa-code" autoFocus autoComplete="one-time-code" inputMode={recovery?'text':'numeric'} pattern={recovery?undefined:'[0-9]{6}'} maxLength={recovery?40:6} required value={code} onChange={e=>setCode(e.target.value)}/></div>
 <label className="flex items-center gap-2"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Husk denne enhed i 14 dage</label>
 <p className="text-sm text-slate-600">Vælg kun dette på din egen enhed. Medlemsnummer og PIN kræves stadig ved nyt login.</p>
 <Button type="submit" disabled={busy}>{busy?'Kontrollerer…':'Bekræft'}</Button>
 </form>
 {prompt?.stage==='verify'&&<Button type="button" variant="outline" disabled={busy} onClick={()=>{setRecovery(!recovery);setCode('');}}>{recovery?'Brug authenticator-app':'Brug en gendannelseskode'}</Button>}
 <Button type="button" variant="outline" disabled={busy} onClick={()=>void act({action:'logout'})}>Tilbage til login</Button>
 </>}
 </section></main>;
}

export function MfaSettings({act,busy}:{act:(body:Record<string,unknown>)=>Promise<boolean>;busy:boolean}) {
 const [message,setMessage]=useState(''),[replace,setReplace]=useState(false),[pin,setPin]=useState(''),[code,setCode]=useState('');
 return <section className="mt-6 space-y-3 border-t pt-4"><h2 className="font-semibold">2FA og huskede enheder</h2>
 <p className="text-sm">Administratorlogin kræver en authenticator-app eller en gendannelseskode. En husket browser er godkendt i 14 dage.</p>
 <Button type="button" variant="outline" disabled={busy} onClick={async()=>{if(await act({action:'mfa_forget_devices'}))setMessage('Alle huskede enheder er glemt. Ved næste login kræves 2FA igen.');}}>Glem alle huskede enheder</Button>
 {message&&<p role="status">{message}</p>}
 <Button type="button" variant="outline" disabled={busy} onClick={()=>setReplace(!replace)}>Skift authenticator / få nye gendannelseskoder</Button>
 {replace&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();if(!busy)void act({action:'mfa_replace',currentPin:pin,code});}}>
 <p className="text-sm">Bekræft med din PIN og en kode fra din nuværende app eller en gendannelseskode. Efter opsætningen logges alle enheder ud, og gamle gendannelseskoder og huskede enheder tilbagekaldes.</p>
 <Label htmlFor="mfa-current-pin">Din PIN</Label><Input id="mfa-current-pin" type="password" inputMode="numeric" autoComplete="current-password" required value={pin} onChange={e=>setPin(e.target.value)}/>
 <Label htmlFor="mfa-current-code">Engangskode eller gendannelseskode</Label><Input id="mfa-current-code" autoComplete="one-time-code" required maxLength={40} value={code} onChange={e=>setCode(e.target.value)}/>
 <Button disabled={busy} type="submit">Start ny 2FA-opsætning</Button>
 </form>}
 </section>;
}
