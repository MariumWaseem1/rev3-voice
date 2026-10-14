import { z } from 'zod';
import { sql, one, rows, locked, type Executor } from './db';
import { hash } from './security';
import { requireThat } from './errors';
import type { Identity } from './auth';

export function ownerProvider(id:string){return (process.env.ADMIN_IDENTITIES||'').split(',').map(v=>v.trim()).filter(Boolean).includes(id);}
export async function approvedEmail(email:string,tx?:Executor){
 if(await one(sql`SELECT email FROM studio_members WHERE email=${email}`,tx))return true;
 const users=await rows<{provider_id:string}>(sql`SELECT provider_id FROM users WHERE lower(email)=${email}`,tx);
 return users.some(u=>ownerProvider(u.provider_id));
}
export async function validInvitation(email:string,code:string,tx?:Executor){
 return one<{id:string;email:string;created_by:string}>(sql`SELECT id,email,created_by FROM studio_invitations WHERE token_hash=${hash(code)} AND email=${email} AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>now()`,tx);
}
// Called only after Supabase has verified this email's one-time code.
export async function approveVerifiedInvitation(email:string,code:string){
 await locked(async tx=>{
  const invite=await validInvitation(email,code,tx);
  requireThat(invite,401,'That access code is invalid, expired or already used for this email.');
  await tx.execute(sql`UPDATE studio_invitations SET redeemed_at=now() WHERE id=${invite.id}`);
  await tx.execute(sql`INSERT INTO studio_members(email,approved_by) VALUES(${email},${invite.created_by}) ON CONFLICT DO NOTHING`);
 });
}
export async function accessOverview(u:Identity){
 requireThat(u.admin,403,'Owner access required');
 return {members:await rows(sql`SELECT email,approved_at FROM studio_members ORDER BY approved_at DESC LIMIT 200`),invitations:await rows(sql`SELECT id,email,created_at,expires_at,redeemed_at,revoked_at FROM studio_invitations ORDER BY created_at DESC LIMIT 200`)};
}
export async function manageAccess(u:Identity,input:unknown){
 requireThat(u.admin,403,'Owner access required');
 const v=z.object({operation:z.enum(['approve','revoke']),email:z.email().max(254).transform(v=>v.toLowerCase())}).strict().parse(input);
 await locked(async tx=>{
  if(v.operation==='approve')await tx.execute(sql`INSERT INTO studio_members(email,approved_by) VALUES(${v.email},${u.id}) ON CONFLICT DO NOTHING`);
  else {
   const accounts=await rows<{provider_id:string}>(sql`SELECT provider_id FROM users WHERE lower(email)=${v.email}`,tx);
   requireThat(!accounts.some(a=>ownerProvider(a.provider_id)),422,'Owner access cannot be revoked here.');
   await tx.execute(sql`DELETE FROM studio_members WHERE email=${v.email}`);
   await tx.execute(sql`UPDATE studio_invitations SET revoked_at=now() WHERE email=${v.email} AND revoked_at IS NULL`);
   await tx.execute(sql`DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE lower(email)=${v.email})`);
  }
 });
 return {updated:true};
}
