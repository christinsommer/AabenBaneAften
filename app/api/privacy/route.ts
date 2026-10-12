/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentPlayer } from '../../../lib/auth';
import { acknowledge,activity,memberData,setPreference } from '../../../lib/privacy-service';
import { sameOrigin } from '../../../lib/privacy-request';
import { PRIVACY_VERSION,CONSENT_VERSION } from '../../../lib/privacy-text';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function GET(){const p=await currentPlayer();if(!p)return Response.json({error:'Log ind først.'},{status:401,headers});return Response.json(await memberData(p.id),{headers});}
export async function POST(request:Request){
  if(!sameOrigin(request))return Response.json({error:'Ugyldigt kald.'},{status:403,headers});
  const p=await currentPlayer();if(!p)return Response.json({error:'Log ind først.'},{status:401,headers});
  try{const b=await request.json() as Record<string, any>;if(b.action==='acknowledge'){if(b.version!==PRIVACY_VERSION)throw Error('Informationen er opdateret. Genindlæs siden.');await acknowledge(p.id);}else if(b.action==='activity')await activity(p.id,'browsing');else if(b.action==='newsletter'){if(b.choice==='subscribe'&&b.consentVersion!==CONSENT_VERSION)throw Error('Samtykketeksten er opdateret. Genindlæs siden.');await setPreference(p.id,b.choice,b.consent===true);}else throw Error('Ukendt handling.');return Response.json(await memberData(p.id),{headers});}
  catch(e){return Response.json({error:e instanceof Error?e.message:'Handlingen mislykkedes.'},{status:400,headers});}
}
