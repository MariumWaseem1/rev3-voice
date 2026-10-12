"use client";
import { useEffect, useState } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
const messages = [
  "Hey, I’m Milo. I’ll show you around.",
];
export function StudioWelcome({ next }: { next: () => void }) {
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState(0);
  const [blink, setBlink] = useState(0);
  const words = messages[step].split(" ");
  useEffect(() => {
    
    const timer = setInterval(() => setShown(n => Math.min(n + 1, messages[step].split(" ").length)), 170);
    return () => clearInterval(timer);
  }, [step]);
  function advance() {
    setBlink(n => n + 1);
    if (step === messages.length - 1) return;
    setShown(0);
    setStep(s => Math.min(s + 1, messages.length - 1));
  }
  return <section className="talking-welcome" aria-label="Welcome to Rev3 Studio">
    <div className="talking-brand">REV3 STUDIO</div>
    <div className="talking-scene">
      <div className="milo-annotation"><span>your studio guide</span><svg viewBox="0 0 110 65" aria-hidden="true"><path d="M105 7 C68 4 65 30 24 57 M24 57 L28 40 M24 57 L42 54" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
      <div className="talking-orb-wrap" key={step}>
        <button className="talking-orb" onClick={advance} aria-label={`${messages[step]} Continue`}>
          <svg key={blink} className={`guide-face ${blink > 0 ? "guide-blink" : ""}`} viewBox="0 0 80 40" aria-hidden="true">
            <ellipse fill="currentColor" cx="27" cy="17" rx="5" ry="7" />
            <ellipse fill="currentColor" cx="53" cy="17" rx="5" ry="7" />
          </svg>
          <span className="talking-words" aria-hidden="true">{words.map((word,i)=><span key={i} className={i < shown ? "word-spoken" : "word-waiting"}>{word} </span>)}</span>
          <span className="orb-shine" aria-hidden="true" />
        </button>
        <span className="talking-shadow" aria-hidden="true" />
      </div>
      <span className="sr-only" role="status">{messages[step]}</span>
      <div className="talking-controls">
        
        {step < messages.length - 1 ? <button className="talking-next" onClick={advance}>Next<ArrowRight size={18}/></button> : shown >= words.length ? <button className="talking-next start-studio" onClick={next}>Start<ArrowRight size={18}/></button> : null}
      </div>
      <button className="talking-replay" onClick={()=>{setBlink(n => n + 1);setShown(0);setStep(0);}}><RotateCcw size={13} /> Start again</button>
    </div>
  </section>;
}
