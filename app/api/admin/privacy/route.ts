/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentPlayer } from '../../../../lib/auth';
import { adminData,draftAction,review,sendRecipient } from '../../../../lib/privacy-service';
import { sameOrigin } from '../../../../lib/privacy-request';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function GET(){const p=await currentPlayer();if(p?.role!=='admin')return Response.json({error:'Kun administratorer har adgang.'},{status:403,headers});return Response.json(await adminData(),{headers});}
export async function POST(request:Request){
  if(!sameOrigin(request))return Response.json({error:'Ugyldigt kald.'},{status:403,headers});
  const p=await currentPlayer();if(p?.role!=='admin')return Response.json({error:'Kun administratorer har adgang.'},{status:403,headers});
  try{const b=await request.json() as Record<string, any>;let result;if(b.action==='review')await review(p.id,b);else if(b.action==='send')result=await sendRecipient(p.id,String(b.id),Number(b.playerId),b.confirm===true);else result=await draftAction(p.id,b);return Response.json({result,data:await adminData()},{headers});}
  catch(e){return Response.json({error:e instanceof Error?e.message:'Handlingen mislykkedes.'},{status:400,headers});}
}
