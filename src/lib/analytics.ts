import { createHash, randomUUID } from 'node:crypto';
const events:Record<string,string>={
 'configuration':'studio_setup_saved','voice':'studio_voice_selected','session/start':'studio_call_requested',
 'session/end':'studio_call_ended','feedback':'studio_feedback_saved','connections':'studio_tools_saved',
 'bookings/slots':'studio_availability_updated','auth/invite':'studio_invitation_redeemed','auth/login':'studio_signed_in'
};
export function analyticsEvent(route:string){return events[route];}
export function posthogConfigured(){return !!process.env.POSTHOG_PROJECT_TOKEN&&process.env.POSTHOG_HOST==='https://eu.i.posthog.com';}
export async function captureStudioEvent(event:string,userId:string){
 if(!posthogConfigured())return false;
 try{
 const response=await fetch('https://eu.i.posthog.com/i/v0/e/',{
 method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(5000),
 body:JSON.stringify({api_key:process.env.POSTHOG_PROJECT_TOKEN,event,uuid:randomUUID(),timestamp:new Date().toISOString(),properties:{distinct_id:createHash('sha256').update(`rev3-analytics:${userId}`).digest('hex'),$process_person_profile:false,$geoip_disable:true,source:'rev3_studio',environment:process.env.NODE_ENV==='production'?'production':'local'}})
 });return response.ok;
 }catch{return false;}
}
