export function VoiceFace({ variant }: { variant: number }) {
  return <svg viewBox="0 0 140 110" aria-hidden="true" className="voice-face-art">
    <g fill="currentColor" opacity=".85">
      {Array.from({length: 15},(_,i)=>{
        const height=12+Math.abs(Math.sin((i+1)*(variant+2)*.37))*48;
        return <rect key={i} x={18+i*7} y={(110-height)/2} width="3" height={height} rx="1.5"/>;
      })}
    </g>
  </svg>;
}
