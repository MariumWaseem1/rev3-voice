"use client";
import { useEffect, useState } from "react";
type Lead = {
  id: string;
  kind: string;
  name: string;
  business: string;
  email: string;
  category: string;
  enquiry: string;
  mail_status: string;
};
export function OwnerEnquiries() {
  const [leads, setLeads] = useState<Lead[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState("");
  useEffect(() => {
    fetch("/api/admin/enquiries")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setLeads(data.enquiries);
      })
      .catch(() => setMessage("Enquiries could not be loaded."));
  }, []);
  return (
    <section className="card">
      <h2>Applications & enquiries</h2>
      <p>
        Approve a Studio application to email a one-use invitation valid for
        seven days.
      </p>
      <p role="status">{message}</p>
      {leads.length === 0 && <p>No applications or enquiries to show.</p>}
      {leads.map((lead) => (
        <article className="record" key={lead.id}>
          <h3>
            {lead.business} · {lead.kind}
          </h3>
          <p>
            {lead.name} · {lead.email} · {lead.category}
          </p>
          <p>{lead.enquiry}</p>
          <small>
            Team email: {lead.mail_status}. The enquiry is saved here.
          </small>
          {lead.kind === "studio" && (
            <button
              className="primary"
              disabled={!!busy}
              onClick={async () => {
                setBusy(lead.id);
                setMessage("");
                try {
                  const r = await fetch("/api/admin/invite", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: lead.email }),
                  });
                  const data = await r.json();
                  if (!r.ok) throw new Error(data.error || "Invitation failed");
                  setMessage(`Invitation sent to ${lead.email}.`);
                } catch (e) {
                  setMessage(
                    e instanceof Error ? e.message : "Please try again.",
                  );
                } finally {
                  setBusy("");
                }
              }}
            >
              {busy === lead.id ? "Sending…" : "Approve & email invitation"}
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
