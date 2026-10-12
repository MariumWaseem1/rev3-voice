"use client";
import { useState } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import { categories, taskOptions } from "@/lib/catalogue";
import { type Configuration, missingConfiguration } from "@/lib/schemas";
import { Field, Area } from "./ui";
type Props = { value: Configuration; change: (v: Configuration) => void; save: () => Promise<boolean>; saved: boolean; next: () => void; generate: (prompt: string) => Promise<Configuration>; compose: (c: Configuration) => Promise<string>; busy: boolean };
const handovers = ["The caller asks to speak to a person", "The agent cannot answer the question", "The caller has a complaint", "The caller needs help with an existing booking"];
export function Setup({value:c,change,save,saved,next,busy}:Props) {
  const [savedHere,setSavedHere]=useState(false);
  const [saveNotice,setSaveNotice]=useState("");
  const [intervention,setIntervention]=useState<boolean | null>(c.reviewed ? c.handover!=="No handover" : null);
  const [message,setMessage]=useState("Please fill in your business details.");
  const [otherCategory,setOtherCategory]=useState(!!c.category && !categories.includes(c.category));
  const [otherTask,setOtherTask]=useState(!!c.otherProblem);
  const [otherHandover,setOtherHandover]=useState(!!c.handover && c.handover!=="No handover" && !handovers.includes(c.handover));
  const update=<K extends keyof Configuration>(key:K,value:Configuration[K])=>change({...c,route:"guided",prompt:"",originalPrompt:"",[key]:value,reviewed:key==="reviewed"?value as boolean:false});
  const toggleTask=(task:Configuration["tasks"][number])=>{update("tasks",c.tasks.includes(task)?c.tasks.filter(t=>t!==task):[...c.tasks,task]);setMessage("What would you like me to help with?");};
  return <div className="guided-setup">
    <aside className="setup-guide" aria-live="polite"><div className="talking-orb setup-orb"><svg className="guide-face" viewBox="0 0 80 40" aria-hidden="true"><ellipse fill="currentColor" cx="27" cy="17" rx="5" ry="7"/><ellipse fill="currentColor" cx="53" cy="17" rx="5" ry="7"/></svg><p>{savedHere&&saved?"Your changes are saved. Ready to choose a voice?":message}</p></div></aside>
    <form className="glass-setup-form" onSubmit={async e=>{e.preventDefault();const missing=missingConfiguration(c);if(!c.tasks.length)missing.push("Choose at least one agent task");if(intervention===null)missing.push("Choose Yes or No for human intervention");if(intervention&&!c.handover.trim())missing.push("Choose when a person should help");if(missing.length){setSaveNotice("Before saving: "+missing.join("; "));return;}setSaveNotice("");const ok=await save();setSavedHere(ok);if(!ok)setSaveNotice("Your setup could not be saved. Please check the error above and try again.");}}>
      <header><p className="eyebrow">YOUR BUSINESS / 01</p><h1>Tell me about your business.</h1><p>A few details, then choose what your agent can do.</p></header>
      <fieldset onFocus={()=>setMessage("Please fill in your business details.")}><legend>Your business</legend>
        <div className="form-grid"><Field label="Business name" required maxLength={200} value={c.businessName} onChange={e=>update("businessName",e.target.value)}/><Field label="Agent name" required maxLength={200} value={c.receptionistName} onChange={e=>update("receptionistName",e.target.value)}/></div>
        <div className="choice-pills">{categories.map(category=><button type="button" key={category} aria-pressed={category==="Other"?otherCategory:c.category===category} onClick={()=>{setOtherCategory(category==="Other");update("category",category==="Other"?"":category);}}>{category}</button>)}</div>
        {otherCategory&&<Field label="Your business type" maxLength={200} value={c.category} onChange={e=>update("category",e.target.value)}/>}
        <Area label="What do you offer?" required maxLength={2000} placeholder="For example: Haircuts, colour and styling in Manchester." value={c.description} onChange={e=>update("description",e.target.value)}/>
      </fieldset>
      <fieldset onFocus={()=>setMessage("Choose the jobs you’d like me to do.")}><legend>What should your agent do?</legend><div className="choice-pills">{taskOptions.filter(task=>task!=="Flag for staff").map(task=><button type="button" key={task} aria-pressed={c.tasks.includes(task)} onClick={()=>toggleTask(task)}>{task}</button>)}<button type="button" aria-pressed={otherTask} onClick={()=>{setOtherTask(!otherTask);if(otherTask)update("otherProblem","");}}>Other</button></div>
      {otherTask&&<Area label="What else would you like?" maxLength={2000} value={c.otherProblem} onChange={e=>update("otherProblem",e.target.value)}/>}{otherTask&&<small>Extra requests help shape your agent. Only the listed demo actions are available for this test.</small>}</fieldset>
      <fieldset onFocus={()=>setMessage("Would you like a person to step in sometimes?")}><legend>Do you want human intervention?</legend>
        <div className="choice-pills">{[true,false].map(yes=><button type="button" key={String(yes)} aria-pressed={intervention===yes} onClick={()=>{setIntervention(yes);setOtherHandover(false);change({...c,route:"guided",prompt:"",originalPrompt:"",handover:yes?handovers[0]:"No handover",tasks:yes?[...c.tasks.filter(t=>t!=="Flag for staff"),"Flag for staff"]:c.tasks.filter(t=>t!=="Flag for staff"),reviewed:false});setMessage(yes?"Choose when you’d like a person to help.":"Got it. I won’t flag requests for a person.");}}>{yes?"Yes":"No"}</button>)}</div>
        {intervention===true&&<><p>When should your agent ask a person to help?</p><div className="choice-pills">{handovers.map(option=><button type="button" key={option} aria-pressed={!otherHandover&&c.handover.split("; ").includes(option)} onClick={()=>{const chosen=otherHandover?[]:c.handover.split("; ").filter(x=>handovers.includes(x));const next=chosen.includes(option)?chosen.filter(x=>x!==option):[...chosen,option];setOtherHandover(false);update("handover",next.join("; "));}}>{option}</button>)}<button type="button" aria-pressed={otherHandover} onClick={()=>{setOtherHandover(true);update("handover","");}}>Other</button></div>{otherHandover&&<Area label="Describe the situation" required maxLength={2000} placeholder="For example: A caller asks for a refund." value={c.handover} onChange={e=>update("handover",e.target.value)}/>}<small>Select when your agent should flag a conversation for your team.</small></>}
        {intervention===false&&<small>The agent will explain when it cannot help, without flagging the conversation for staff.</small>}
      </fieldset>
      <details open={c.tasks.includes("Demo appointments")} onToggle={e=>{if(e.currentTarget.open)setMessage("Add the details I’ll need to answer accurately.");}}><summary>Opening hours, services & common questions</summary>
        <Field label="Timezone" required value={c.timezone} onChange={e=>update("timezone",e.target.value)}/>
        <div className="choice-pills"><button type="button" onClick={()=>update("openingHours",[1,2,3,4,5].map(day=>({day,open:"09:00",close:"17:00"})))}>Mon–Fri, 9–5</button><button type="button" onClick={()=>update("openingHours",[1,2,3,4,5,6,7].map(day=>({day,open:"09:00",close:"17:00"})))}>Every day, 9–5</button></div>
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day,i)=>{const h=c.openingHours.find(x=>x.day===i+1);return <div className="hours-row" key={day}><label><input type="checkbox" checked={!!h} onChange={()=>update("openingHours",h?c.openingHours.filter(x=>x.day!==i+1):[...c.openingHours,{day:i+1,open:"09:00",close:"17:00"}])}/>{day}</label>{h&&<><input aria-label={`${day} opens`} type="time" value={h.open} onChange={e=>update("openingHours",c.openingHours.map(x=>x.day===i+1?{...x,open:e.target.value}:x))}/><input aria-label={`${day} closes`} type="time" value={h.close} onChange={e=>update("openingHours",c.openingHours.map(x=>x.day===i+1?{...x,close:e.target.value}:x))}/></>}</div>})}
        {c.services.map((service,i)=><div className="form-grid" key={service.id}><Field label="Service" required value={service.name} onChange={e=>update("services",c.services.map((s,j)=>i===j?{...s,name:e.target.value}:s))}/><Field label="Minutes" type="number" min={5} max={240} required value={service.minutes} onChange={e=>update("services",c.services.map((s,j)=>i===j?{...s,minutes:Number(e.target.value)}:s))}/><button type="button" aria-label="Remove service" onClick={()=>update("services",c.services.filter((_,j)=>j!==i))}><X size={16}/></button></div>)}
        <button type="button" className="text-button" disabled={c.services.length>=20} onClick={()=>update("services",[...c.services,{id:crypto.randomUUID(),name:"",minutes:30,price:""}])}><Plus size={15}/> Add service</button>
        {c.faqs.map((faq,i)=><div key={i}><Field label="Question" required value={faq.question} onChange={e=>update("faqs",c.faqs.map((f,j)=>i===j?{...f,question:e.target.value}:f))}/><Area label="Answer" required value={faq.answer} onChange={e=>update("faqs",c.faqs.map((f,j)=>i===j?{...f,answer:e.target.value}:f))}/><button type="button" className="text-button" onClick={()=>update("faqs",c.faqs.filter((_,j)=>i!==j))}>Remove question</button></div>)}
        <button type="button" className="text-button" disabled={c.faqs.length>=30} onClick={()=>update("faqs",[...c.faqs,{question:"",answer:""}])}><Plus size={15}/> Add common question</button>
      </details>
      <label className="check-line"><input type="checkbox" checked={c.reviewed} onChange={e=>update("reviewed",e.target.checked)}/> These details are correct.</label>
      {saveNotice&&<p role="alert" className="setup-save-notice">{saveNotice}</p>}
      <div className="setup-save-actions">
        <button type="submit" className="secondary" disabled={busy||saved}>{busy?"Saving…":saved?"Saved":"Save my setup"}</button>
        <button type="button" className="primary" disabled={busy||!saved} onClick={next}>Next: choose a voice <ArrowRight size={18}/></button>
      </div>
      <p role="status">{saved ? (savedHere?"Your business setup is saved. You can continue.":"Your saved setup is ready. You can continue or edit it.") : "Save your setup to continue to voices."}</p>
    </form>
  </div>;
}
