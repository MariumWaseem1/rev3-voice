"use client";
import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import type { Configuration } from "@/lib/schemas";
export type SlotDraft = { serviceId: string; start: string };
export function SetupSlots({
  configuration: c,
  drafts,
  change,
  context = "setup",
  onAdd,
}: {
  context?: "setup" | "dashboard";
  onAdd?: (slot:SlotDraft)=>Promise<void>;
  configuration: Configuration;
  drafts: SlotDraft[];
  change: (v: SlotDraft[]) => void;
}) {
  const [service, setService] = useState(""),
    [date, setDate] = useState(""),
    [time, setTime] = useState("");
  const [saved, setSaved] = useState<
    { id: string; service_id: string; starts_at: string }[]
  >([]);
  const [adding,setAdding]=useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/bookings", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw Error("Could not load saved slots.");
        return r.json();
      })
      .then((d) => {
        if (active) setSaved(d.slots);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [drafts]);
  const selected = c.services.find(s=>s.id===service) || c.services.find(s=>s.name.trim());
  const dates=Array.from({length:90},(_,i)=>DateTime.now().setZone(c.timezone).startOf('day').plus({days:i})).filter(d=>{const h=c.openingHours.find(h=>h.day===d.weekday);return h&&selected&&d.set({hour:Number(h.close.slice(0,2)),minute:Number(h.close.slice(3))}).minus({minutes:selected.minutes}).toMillis()>Date.now()});
  const chosenDate=dates.some(d=>d.toISODate()===date)?date:dates[0]?.toISODate()||'';
  const day = DateTime.fromISO(chosenDate, { zone: c.timezone });
  const hours = c.openingHours.find((h) => h.day === day.weekday);
  const times: string[] = [];
  if (day.isValid && hours && selected) {
    let t = day.set({
      hour: Number(hours.open.slice(0, 2)),
      minute: Number(hours.open.slice(3)),
    });
    const close = day.set({
      hour: Number(hours.close.slice(0, 2)),
      minute: Number(hours.close.slice(3)),
    });
    for (
      let i = 0;
      i < 96 && t.plus({ minutes: selected.minutes }) <= close;
      i++, t = t.plus({ minutes: 15 })
    ) {
      if (t.toMillis() > Date.now() && t.getPossibleOffsets().length === 1)
        times.push(t.toFormat("HH:mm"));
    }
  }
  return (
    <fieldset className="availability-editor">
      <legend>Your available times</legend>
      <p>
        Choose a service, date and time. {context === "setup" ? "Slots are saved with your business setup." : "Add a time to save it directly to your calendar."} Times use {c.timezone}.
      </p>
      {!selected ? (
        <p>Add a service above first.</p>
      ) : (
        <div className="booking-slot-form">
          <label>
            Service
            <select
              value={selected.id}
              onChange={(e) => {
                setService(e.target.value);
                setTime("");
              }}
            >
              {c.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || "Unnamed service"} · {s.minutes} min
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <select aria-label="Appointment date" value={chosenDate} disabled={!dates.length} onChange={e=>{setDate(e.target.value);setTime('')}}>
              {!dates.length&&<option value="">Set opening hours first</option>}
              {dates.map(d=><option key={d.toISODate()} value={d.toISODate()!}>{d.toFormat('ccc d LLL yyyy')}</option>)}
            </select>
          </label>
          <label>
            Time
            <select aria-label="Appointment time" disabled={!times.length} value={times.includes(time)?time:""} onChange={(e) => setTime(e.target.value)}>
              <option value="">Choose a time</option>
              {times.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="secondary"
            disabled={adding || !time || !times.includes(time)}
            onClick={async () => {
              const start = DateTime.fromISO(`${chosenDate}T${time}`, {
                zone: c.timezone,
              }).toISO()!;
              if (
                drafts.some((s) => s.start === start) ||
                saved.some(
                  (s) =>
                    DateTime.fromISO(s.starts_at).toMillis() ===
                    DateTime.fromISO(start).toMillis(),
                )
              ) {
                setError("That time is already added.");
                return;
              }
              setError("");
              if(onAdd){setAdding(true);try{await onAdd({serviceId:selected.id,start});const r=await fetch('/api/bookings',{cache:'no-store'});if(r.ok)setSaved((await r.json()).slots);setTime('');}catch(e){setError(e instanceof Error?e.message:'Could not add time.');}finally{setAdding(false);}}
              else {change([...drafts, { serviceId: selected.id, start }]);setTime('');}
            }}
          >
            {adding?"Adding…":"Add time"}
          </button>
        </div>
      )}
      {!times.length && (
        <p>Add opening hours and a service duration above to see available dates and times.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <ul className="booking-slot-list">
        {context === "setup" && saved.map((s) => (
          <li key={s.id}>
            {DateTime.fromISO(s.starts_at)
              .setZone(c.timezone)
              .toFormat("ccc d LLL, HH:mm")}{" "}
            · {c.services.find((x) => x.id === s.service_id)?.name || "Service"}{" "}
            · Saved
          </li>
        ))}
        {drafts.map((s, i) => (
          <li key={s.start}>
            <span>
              {DateTime.fromISO(s.start)
                .setZone(c.timezone)
                .toFormat("ccc d LLL, HH:mm")}{" "}
              · {c.services.find((x) => x.id === s.serviceId)?.name} · Not saved
              yet
            </span>
            <button
              type="button"
              onClick={() => change(drafts.filter((_, n) => n !== i))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
