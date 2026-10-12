"use client";
import { useState } from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import Image from "next/image";
export function StudioAccess() {
 const router=useRouter();
  const [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="access-page">
      <a href="https://rev3.uk">
        <Image src="/rev3-logo.png" width={64} height={64} alt="Rev3" />
      </a>
      <section>
        <p className="eyebrow">REV3 CO-CREATION PROGRAMME</p>
        <h1>Your place in Studio.</h1>
        <p>Enter the access code from your invitation email.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const response = await fetch("/api/auth/invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: code.trim() }),
              });
              const data = await response.json();
              if (!response.ok)
                throw new Error(data.error || "Please try again.");
              router.push("/"); router.refresh();
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Please try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="studio-code">Access code</label>
          <input
            id="studio-code"
            type="password"
            autoComplete="one-time-code"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            minLength={30}
            maxLength={100}
          />
          <button className="primary" disabled={busy}>
            {busy ? "Opening…" : "Open Studio"}
          </button>
          <p role="alert">{error}</p>
        </form>
        <p>
          Already joined? <Link href="/">Sign in by email</Link>
        </p>
        <p>
          Not invited yet? <a href="https://rev3.uk/#studio">Apply to Studio</a>
        </p>
      </section>
    </main>
  );
}
