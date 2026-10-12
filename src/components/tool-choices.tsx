"use client";
import { useState } from "react";
import { Field } from "./ui";
export function ToolChoices({label,options,value,change}:{label:string;options:string[];value:string;change:(value:string)=>void}) {
 const [other,setOther]=useState(!!value&&!options.includes(value));
 return <fieldset><legend>{label}</legend><div className="choice-pills">{options.map(option=><button type="button" key={option} aria-pressed={!other&&value===option} onClick={()=>{setOther(false);change(option);}}>{option}</button>)}<button type="button" aria-pressed={other} onClick={()=>{setOther(true);if(options.includes(value))change("");}}>Other</button></div>{other&&<Field label={`Other ${label.toLowerCase()}`} maxLength={200} value={value} onChange={e=>change(e.target.value)}/>}</fieldset>;
}
