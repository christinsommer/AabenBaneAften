/* eslint-disable @typescript-eslint/no-explicit-any */
import { tokenAction } from '../../../lib/privacy-service';
import { sameOrigin } from '../../../lib/privacy-request';
export async function POST(request:Request){
  const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
  if(!sameOrigin(request))return Response.json({error:'Ugyldigt kald.'},{status:403,headers});
  try{const b=await request.json() as Record<string, any>;if(b.confirm!==true)throw Error('Bekræft dit valg.');await tokenAction(String(b.token),String(b.choice));return Response.json({ok:true},{headers});}catch{return Response.json({error:'Valget kunne ikke gemmes. Linket kan være udløbet; brug din profil eller kontakt aabenbaneaften@hik.dk.'},{status:400,headers});}
}
