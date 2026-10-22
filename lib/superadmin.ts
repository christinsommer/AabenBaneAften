import {getCloudflareContext} from '@opennextjs/cloudflare';

// Deployment-owned account binding. Names and editable profile fields grant no privileges.
export function superAdminPlayerId(): number | null {
  const env=getCloudflareContext().env as CloudflareEnv & {SUPERADMIN_PLAYER_ID?:string};
  const value=String(env.SUPERADMIN_PLAYER_ID??'');
  return /^[1-9]\d*$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):null;
}
export function isSuperAdmin(user:{id:number;role:string}|null|undefined):boolean {
  return !!user&&user.role==='admin'&&user.id===superAdminPlayerId();
}
