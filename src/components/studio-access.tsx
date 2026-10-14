"use client";
import {useState} from 'react';
import Image from 'next/image';
export function StudioAccess(){
 const [mode,setMode]=useState<'invite'|'email'>('invite'),[email,setEmail]=useState(''),[invite,setInvite]=useState(''),[otp,setOtp]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <main className="access-page"><a href="https://rev3.uk"><Image src="/rev3-logo.png" width={64} height={64} alt="Rev3"/></a><section>
 <p className="eyebrow">REV3 CO-CREATION PROGRAMME</p><h1>{sent?'Check your email.':'Your place in Studio.'}</h1>
 <p>{sent?'Enter the one-time code we emailed you to verify your address.':mode==='invite'?'Got an access code? Enter it with the email address on your invitation.':'Already approved? Use the email address Rev3 approved for you.'}</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{
 const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),...(mode==='invite'?{inviteCode:invite.trim()}:{}),...(sent?{token:otp}:{})})});
 const d=await r.json();if(!r.ok)throw Error(d.error||'Please try again.');
 if(d.verified)window.location.assign('/studio');else setSent(true);
 }catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}}>
 <label htmlFor="access-email">Your email</label><input id="access-email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254} disabled={sent||busy}/>
 {mode==='invite'&&!sent&&<><label htmlFor="access-code">Access code</label><input id="access-code" value={invite} onChange={e=>setInvite(e.target.value)} autoComplete="off" spellCheck={false} required minLength={30} maxLength={100} disabled={busy}/></>}
 {sent&&<><label htmlFor="email-code">Email verification code</label><input id="email-code" value={otp} onChange={e=>setOtp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" required disabled={busy}/></>}
 <button className="primary" disabled={busy}>{busy?'Please wait...':sent?'Verify email and enter':'Send email verification code'}</button><p role="alert">{error}</p>
 </form>
 {sent?<button disabled={busy} onClick={()=>{setSent(false);setOtp('');setError('');}}>Change details or resend code</button>:<button disabled={busy} onClick={()=>{setMode(mode==='invite'?'email':'invite');setError('');}}>{mode==='invite'?'My email is already approved':'I have an access code'}</button>}
 <p>No access yet? <a href="https://rev3.uk/?apply=studio#studio">Apply to Studio</a></p><p className="muted">An application does not grant access. Every account needs approval and email verification.</p>
 </section></main>;
}
