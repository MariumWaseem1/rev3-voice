import { useId } from "react";

export function StudioPhone({ lifted = false }: { lifted?: boolean }) {
  const logoClip = useId();
  const bodyGradient = useId(), faceGradient = useId(), receiverGradient = useId(), dialGradient = useId();
  return <svg className={`studio-phone ${lifted ? "receiver-lifted" : ""}`} viewBox="0 0 360 270" aria-hidden="true">
    <defs>
      <linearGradient id={bodyGradient} x1="0" y1="0" x2=".8" y2="1" gradientUnits="objectBoundingBox"><stop stopColor="#FF641E"/><stop offset=".45" stopColor="#E8440D"/><stop offset="1" stopColor="#8D2308"/></linearGradient>
      <linearGradient id={faceGradient} x1="0" y1="0" x2=".7" y2="1"><stop stopColor="#FF782D"/><stop offset=".35" stopColor="#F45113"/><stop offset="1" stopColor="#BC310A"/></linearGradient>
      <linearGradient id={receiverGradient} x1="0" y1="0" x2=".2" y2="1"><stop stopColor="#FF8A40"/><stop offset=".25" stopColor="#FF5418"/><stop offset=".65" stopColor="#CD350A"/><stop offset="1" stopColor="#782008"/></linearGradient>
      <radialGradient id={dialGradient}><stop stopColor="#343634"/><stop offset=".8" stopColor="#171817"/><stop offset="1" stopColor="#080908"/></radialGradient>
<clipPath id={logoClip}><circle cx="180" cy="160" r="20" /></clipPath></defs>
    <ellipse cx="180" cy="248" rx="130" ry="12" fill="#171817" opacity=".5"/>
    <path d="M278 100 C335 95 325 158 301 166 C276 175 334 190 307 209" fill="none" stroke="#4B3431" strokeWidth="9" strokeLinecap="round"/>
    <path d="M96 89 Q180 69 264 89 L306 214 Q313 240 280 241 H80 Q47 240 54 214Z" fill={`url(#${bodyGradient})`} stroke="#F5F6F5" strokeOpacity=".25" strokeWidth="2"/>
    <path d="M105 101 Q180 82 255 101 L283 204 Q180 224 77 204Z" fill={`url(#${faceGradient})`}/>
    <path d="M69 215 Q180 245 293 215" fill="none" stroke="#6D1C08" strokeWidth="7" opacity=".55"/>
    <path d="M106 102 Q180 84 252 102" fill="none" stroke="#FFB06B" strokeWidth="3" opacity=".55"/>
    <ellipse cx="180" cy="165" rx="58" ry="57" fill="#601B08" opacity=".4"/>
    <circle cx="180" cy="160" r="56" fill={`url(#${dialGradient})`} stroke="#91B7AD" strokeOpacity=".4" strokeWidth="3"/>
    {Array.from({length:10},(_,i)=>{const a=(i*29+35)*Math.PI/180;return <g key={i}><circle cx={180+40*Math.cos(a)} cy={160+40*Math.sin(a)} r="9" fill="#F5F6F5" fillOpacity=".8"/><text x={180+40*Math.cos(a)} y={164+40*Math.sin(a)} textAnchor="middle" fill="#171817" fontSize="10">{(i+1)%10}</text></g>})}
    <circle cx="180" cy="160" r="22" fill="#4B3431"/><image href={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/rev3-logo.png`} x="160" y="140" width="40" height="40" clipPath={`url(#${logoClip})`} />
    <g className="phone-receiver"><path d="M79 101 L66 70 Q66 39 106 35 Q180 18 254 35 Q294 39 294 70 L281 101 L240 92 L240 62 Q180 49 120 62 L120 92Z" fill={`url(#${receiverGradient})`} stroke="#F5F6F5" strokeOpacity=".3" strokeWidth="2"/><path d="M104 45 Q180 27 256 45" fill="none" stroke="#F5F6F5" strokeOpacity=".17" strokeWidth="4" strokeLinecap="round"/></g>
  </svg>;
}
