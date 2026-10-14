"use client";
import { useCallback, useEffect, useState } from "react";
import { SetupSlots, type SlotDraft } from "./setup-slots";
import { DateTime } from "luxon";
import type { Configuration } from "@/lib/schemas";
type Data = {
  slots: {
    id: string;
    service_id: string;
    starts_at: string;
    ends_at: string;
  }[];
  bookings: {
    id: string;
    service_name: string;
    customer: string;
    starts_at: string;
    ends_at: string;
    status: string;
    reference: string;
  }[];
  emails: {
    id: string;
    booking_id: string;
    recipient_role: string;
    status: string;
  }[];
  emailConfigured: boolean;
  ownerEmail: string;
};
async function request(path: string, body?: unknown) {
  const r = await fetch(
    `/api/${path}`,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Please try again.");
  return d;
}
export function BookingDashboard({
  configuration,
}: {
  configuration: Configuration | null;
}) {
  const [drafts, setDrafts] = useState<SlotDraft[]>([]);
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setData(await request("bookings"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load bookings.");
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 10000);
    return () => clearInterval(timer);
  }, [refresh]);
  const zone = configuration?.timezone || "Europe/London";
  const when = (value: string) =>
    DateTime.fromISO(value).setZone(zone).toFormat("ccc d LLL, HH:mm");
  async function save(body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      await request("bookings/slots", body);
      await refresh();
      setMessage("Availability saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="booking-dashboard">
      <header>
        <p className="eyebrow">YOUR BOOKING CALENDAR</p>
        <h1>Make time for your customers.</h1>
        <p>Your saved times and bookings, updated automatically.</p>
      </header>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <section className="card">
        <h2>Your availability</h2>
        <p>
          Add times here or in business setup. Bookings and changes made during
          calls appear below.
        </p>
        {configuration ? (
          <>
            <SetupSlots
              configuration={configuration}
              drafts={drafts}
              change={setDrafts}
              context="dashboard"
              onAdd={async slot=>{await request("bookings/slots",{operation:"add",...slot});await refresh();setMessage("Time added to your calendar.");}}
            />

          </>
        ) : (
          <p>
            Save your business details and services first, then add times here.
          </p>
        )}
      </section>
      <section className="card">
        <h2>Available times</h2>
        {!data ? (
          <p>Loading calendar…</p>
        ) : !data.slots.length ? (
          <p>
            No slots yet. Add times in your business setup before testing a
            booking.
          </p>
        ) : (
          <ul className="booking-slot-list">
            {data.slots.map((s) => {
              const booked = data.bookings.some(
                (b) =>
                  b.status === "confirmed" &&
                  b.starts_at < s.ends_at &&
                  b.ends_at > s.starts_at,
              );
              return (
                <li key={s.id}>
                  <div>
                    <strong>{when(s.starts_at)}</strong>
                    <p>
                      {configuration?.services.find(
                        (x) => x.id === s.service_id,
                      )?.name || "Service"}{" "}
                      · {booked ? "Booked" : "Available"}
                    </p>
                  </div>
                  <button
                    className="secondary"
                    disabled={busy || booked}
                    onClick={() => void save({ operation: "remove", id: s.id })}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="card">
        <h2>Your bookings</h2>
        <p>Refreshes automatically every 10 seconds.</p>
        {!data?.bookings.length ? (
          <p>
            No bookings yet. Ask your agent to book one of your available times.
          </p>
        ) : (
          <div className="recap-table-scroll">
            <table className="recap-table">
              <thead>
                <tr>
                  <th>Appointment</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Confirmation emails</th>
                </tr>
              </thead>
              <tbody>
                {data.bookings.map((b) => (
                  <tr key={b.id}>
                    <td>
                      {b.service_name}
                      <br />
                      {when(b.starts_at)}
                      <br />
                      <small>{b.reference}</small>
                    </td>
                    <td>{b.customer}</td>
                    <td>{b.status}</td>
                    <td>
                      {["caller", "owner"].map((role) => {
                        const mail = data.emails.find(
                          (e) =>
                            e.booking_id === b.id && e.recipient_role === role,
                        );
                        return (
                          <p key={role}>
                            {role === "caller" ? "Caller" : "Business"}:{" "}
                            {mail
                              ? mail.status === "sent"
                                ? "Sent to email provider"
                                : mail.status === "sending"
                                  ? "Sending"
                                  : mail.status
                              : "Not queued"}
                          </p>
                        );
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
