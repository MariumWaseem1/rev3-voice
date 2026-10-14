import { posthogConfigured } from "./analytics";
import { sql, rows, one } from './db';
import { requireThat } from './errors';
import type { Identity } from './auth';
export async function adminOverview(u:Identity){
 requireThat(u.admin,403,'Owner access required');
 const [counts,people]=await Promise.all([
 one(sql`SELECT (SELECT count(*) FROM users) AS users,(SELECT count(*) FROM voice_sessions) AS calls,(SELECT count(*) FROM demo_bookings WHERE status='confirmed') AS bookings,(SELECT count(*) FROM company_enquiries WHERE kind='studio') AS applications`),
 rows(sql`SELECT u.id,u.email,u.created_at,w.id AS workspace_id,(SELECT data->>'businessName' FROM configurations WHERE workspace_id=w.id ORDER BY version DESC LIMIT 1) AS business,(SELECT count(*) FROM voice_sessions WHERE workspace_id=w.id) AS calls FROM users u LEFT JOIN workspaces w ON w.user_id=u.id ORDER BY u.created_at DESC LIMIT 200`)
 ]);
 return {counts,people,posthogConfigured:posthogConfigured() && !!process.env.POSTHOG_PROJECT_URL};
}
export async function adminPerson(u:Identity,id:string){
 requireThat(u.admin,403,'Owner access required');
 const person=await one<{workspace_id:string;email:string}>(sql`SELECT u.email,w.id AS workspace_id FROM users u JOIN workspaces w ON w.user_id=u.id WHERE u.id=${id}`);
 requireThat(person,404,'User not found');
 const [calls,bookings]=await Promise.all([
 rows(sql`SELECT id,state,reserved_at,ended_at,error FROM voice_sessions WHERE workspace_id=${person.workspace_id} ORDER BY reserved_at DESC LIMIT 100`),
 rows(sql`SELECT id,service_name,customer,starts_at,status,reference FROM demo_bookings WHERE workspace_id=${person.workspace_id} ORDER BY starts_at DESC LIMIT 100`)
 ]);return {person,calls,bookings};
}
export async function adminConversation(u:Identity,id:string){
 requireThat(u.admin,403,'Owner access required');
 const call=await one(sql`SELECT id,state FROM voice_sessions WHERE id=${id}`);requireThat(call,404,'Call not found');
 const [turns,actions]=await Promise.all([rows(sql`SELECT id,role,text,sentiment,created_at FROM transcript_turns WHERE session_id=${id} ORDER BY created_at,id`),rows(sql`SELECT name,status,result,created_at FROM action_events WHERE session_id=${id} ORDER BY created_at`)]);
 return {call,turns,actions};
}
