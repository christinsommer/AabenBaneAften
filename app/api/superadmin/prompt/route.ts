import {currentPlayer} from '../../../../lib/auth';
import {isSuperAdmin} from '../../../../lib/superadmin';
import {kampplanPrompt} from '../../../../lib/kampplan-prompt';

export async function GET(){
  const user=await currentPlayer();
  if(!user)return Response.json({error:'Log ind først.'},{status:401});
  if(!isSuperAdmin(user))return Response.json({error:'Kun SuperAdmin har adgang.'},{status:403});
  return new Response(kampplanPrompt,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
}
