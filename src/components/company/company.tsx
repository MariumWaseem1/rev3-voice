"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  X,
  Menu,
  Check,
  Phone,
} from "lucide-react";
import styles from "./company.module.css";
type FormKind = "studio" | "service" | "contact";
export function Company({ studioUrl }: { studioUrl: string }) {
  const [mapLoaded,setMapLoaded]=useState(false);
  const [form, setForm] = useState<FormKind | null>(null),
    [menu, setMenu] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLElement | null>(null);
  const [scene, setScene] = useState(0),
    [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const id = setInterval(() => setScene((s) => (s + 1) % 3), 4500);
    return () => clearInterval(id);
  }, [paused]);
  useEffect(() => {
    if (form) {
      const element=dialog.current;
      element?.showModal();
      return () => element?.close();
    }
  }, [form]);
  function open(kind: FormKind) {
    trigger.current = document.activeElement as HTMLElement;
    setMessage("");
    setForm(kind);
  }
  function close() {
    setForm(null);
    trigger.current?.focus();
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const el = e.currentTarget;
    setBusy(true);
    setMessage("");
    try {
      const fields = new FormData(el);
      const data = Object.fromEntries(fields);
      const qualification = ['role','callsPerWeek','teamSize','currentHandling','goal','tools','readiness','feedback'];
      if(form==='studio') {
        const application=Object.fromEntries(qualification.map(key=>[key,fields.get(key)]));
        qualification.forEach(key=>delete data[key]);
        Object.assign(data,{application});
      }
      const r = await fetch("/api/public/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, kind: form }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Please try again.");
      setMessage(
        form === "studio"
          ? "Application received. We’ll review it and email you about a place in Studio."
          : "Thanks. Your enquiry is with us. We’ll be in touch.",
      );
      el.reset();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(()=>{if(new URLSearchParams(window.location.search).get('apply')==='studio')setForm('studio');},[]);
  const scenes = [
    {
      title: "A call comes in.",
      body: "A customer has a question. Your team has a queue.",
      label: "INCOMING CALL",
      line: "Hi, can I book a consultation?",
      reply: "Let’s find a time that works for you.",
    },
    {
      title: "A conversation gets things moving.",
      body: "Your agent follows your business information and agreed rules.",
      label: "UNDERSTAND + CONFIRM",
      line: "Thursday afternoon, if you have anything?",
      reply: "I’ll check the connected calendar.",
    },
    {
      title: "Your team gets the next step.",
      body: "Details reach the right place, with a person involved when needed.",
      label: "APPROVED NEXT STEP",
      line: "That works for me. Thank you.",
      reply: "Your details are confirmed. Here’s what happens next.",
    },
  ];
  return (
    <div className={styles.site}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <header className={styles.nav}>
        <a href="#top" className={styles.brand}>
          <Image src="/rev3-logo.png" width={48} height={48} alt="Rev3" />
          <span>REV3</span>
        </a>
        <button
          className={styles.mobileToggle}
          aria-label="Toggle menu"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          <Menu />
        </button>
        <nav
          className={menu ? styles.openNav : ""}
          aria-label="Main navigation"
        >
          <a href="#services" onClick={() => setMenu(false)}>
            What we do
          </a>
          <a href="#studio" onClick={() => setMenu(false)}>
            Build with us
          </a>
          <a href="#contact" onClick={() => setMenu(false)}>
            Contact
          </a>
          <a className={styles.outline} href={`${studioUrl}/access`}>
            Enter access code <ArrowUpRight size={15} />
          </a>
        </nav>
      </header>
      <main id="main">
        <section className={styles.hero} id="top">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span /> VOICE TECHNOLOGY. HUMAN PURPOSE.
            </p>
            <h1>
              Why does everything
              <br />
              <em>need a screen?</em>
            </h1>
            <p className={styles.lead}>
              Discover a more natural way to interact with technology. Just speak.
            </p>
            <div className={styles.actions}>
              <button
                className={styles.primary}
                onClick={() => open("service")}
              >
                Build for me <ArrowUpRight size={18} />
              </button>
              <a className={styles.outline} href="#studio">
                Build with us <ArrowRight size={18} />
              </a>
            </div>
            <p className={styles.micro}>
              Products. Services. Ideas we build together.
            </p>
          </div>
          <div
            className={styles.heroArt}
            role="img"
            aria-label="A screen fades into a voice waveform. Just speak."
          >
            <div className={styles.screenFrame} aria-hidden="true">
              <div className={styles.screenTop}><i /><i /><i /></div>
              <div className={styles.screenLines}><i /><i /><i /></div>
            </div>
            <div className={styles.voiceHalo} aria-hidden="true" />
            <div className={styles.speechWave} aria-hidden="true">
              {[24, 42, 65, 36, 83, 56, 100, 70, 44, 87, 58, 32, 68, 45, 22].map((height, index) => (
                <i key={index} style={{ height: `${height}%`, animationDelay: `${index * -0.13}s` }} />
              ))}
            </div>
            <span className={styles.speakCaption} aria-hidden="true">Just speak.</span>
          </div>
        </section>
        <div className={styles.signalStrip}>
          <span>Voice products</span>
          <Plus />
          <span>Voice services</span>
          <Plus />
          <span>Co-creation</span>
        </div>
        <section className={styles.section} id="services">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>01 / THE WORLD OF REV3</p>
            <h2>
              Make room for voice.
            </h2>
            <p>
              A simpler way to ask, connect and get things done. We’re building it with the people who’ll use it.
            </p>
          </div>
          <div className={styles.problemGrid}>
            <div className={styles.connectingSignal} aria-hidden="true"><span /></div>
            {[
              {
                n: "01",
                title: "Voice agents",
                text: "Voice that gets work done. AI agents that understand speech, connect your tools and turn conversations into action.",
              },
              {
                n: "02",
                title: "Rev3 Studio",
                text: "Our co-creation programme. Try voice technology and help shape what we build.",
              },
              {
                n: "03",
                title: "Beyond calls",
                text: "We’re developing new voice products and services that go beyond the phone.",
              },
            ].map((p) => (
              <article key={p.n}>
                <span>{p.n}</span>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className={styles.toolsSection} aria-label="Connected tools">
          <div className={styles.toolsHeading}>
            <div><h2>Works with the tools you use.</h2><p>Calendars, booking systems and CRM. Connections scoped for your service.</p></div>
          </div>
          <div className={styles.toolsWindow}>
            <div className={styles.toolsTrack}>
              {[0, 1].map(copy => <div className={styles.toolsGroup} key={copy} aria-hidden={copy === 1 ? true : undefined}>
                {["Google Calendar", "HubSpot", "Calendly", "Salesforce", "Microsoft Bookings", "Pipedrive"].map(tool => <span key={tool}><span className={styles.toolMark} aria-hidden="true">{tool.slice(0, 1)}</span>{tool}</span>)}
              </div>)}
            </div>
          </div>
          <p className={styles.toolsNote}>Examples of tools we can assess for your setup. Availability depends on the tool’s API and your plan.</p>
        </section>
        <section className={styles.callSection}>
          <div>
            <p className={styles.eyebrow}>ONE APPLICATION / VOICE AGENTS</p>
            <h2>{scenes[scene].title}</h2>
            <p>{scenes[scene].body}</p>
            <div className={styles.sceneButtons}>
              {scenes.map((s, i) => (
                <button
                  key={s.title}
                  aria-label={`Show step ${i + 1}: ${s.title}`}
                  aria-pressed={i === scene}
                  onClick={() => {
                    setScene(i);
                    setPaused(true);
                  }}
                >
                  0{i + 1}
                </button>
              ))}
              <button onClick={() => setPaused(!paused)}>
                {paused ? "Play" : "Pause"}
              </button>
            </div>
            <small>
              Illustrative workflow. Connections and actions are agreed for your
              service.
            </small>
          </div>
          <div className={styles.callCard}>
            <div className={styles.callTop}>
              <Phone size={18} />
              <span>{scenes[scene].label}</span>
              <span>EXAMPLE</span>
            </div>
            <div className={styles.wave} aria-hidden="true">
              {Array.from({ length: 27 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    height: `${18 + ((i * 17) % 58)}px`,
                    animationDelay: `${i * 0.07}s`,
                  }}
                />
              ))}
            </div>
            <div className={styles.dialogue} key={scene}>
              <p>
                <small>CUSTOMER</small>
                {scenes[scene].line}
              </p>
              <p>
                <small>REV3</small>
                {scenes[scene].reply}
              </p>
            </div>
            <div className={styles.callBottom}>
              <Check size={16} /> Your rules. Your tools. Your team in control.
            </div>
          </div>
        </section>
        <section className={styles.serviceBand}>
          <div>
            <p className={styles.eyebrow}>THE VOICE AGENT SERVICE</p>
            <h2>
              You speak.
              <br />
              Your agent gets to work.
            </h2>
            <p>
              Answer customer calls, book appointments, update your CRM, send confirmations and follow up, using your connected tools and business rules.
            </p>
          </div>
          <div>
            <p>
              For clinics, property teams, trades, automotive businesses and
              anyone whose phone creates more work than it should.
            </p>
            <button className={styles.primary} onClick={() => open("service")}>
              Build for me <ArrowUpRight size={18} />
            </button>
            <small>A short enquiry. A proper conversation.</small>
          </div>
        </section>
        <section className={styles.studioSection} id="studio">
          <div className={styles.studioGrid}>
            <div className={styles.miloStage}>
              <div className={styles.milo}>
                <i />
                <i />
              </div>
              <p>
                Small conversations.
                <br />
                <strong>Better ideas.</strong>
              </p>
              <span>REV3 CO-CREATION PROGRAMME</span>
            </div>
            <div className={styles.studioCopy}>
          <div className={styles.studioHeading}>
            <p className={styles.eyebrow}>02 / BUILT WITH YOU</p>
            <h2>
              Meet Rev3 <em>Studio.</em>
            </h2>
            <p>
              Our co-creation programme. Your experience helps shape the voice
              technology we build next.
            </p>
          </div>

              <h3>
                Built for you.
                <br />
                Better with you.
              </h3>
              <p>
                You know where the work gets stuck. We bring the technology. In
                Studio, you create a voice agent around your business, try a
                conversation and tell us what works and what needs to change.
              </p>
              <ol>
                <li>
                  <span>01</span>
                  <div>
                    <strong>Make it yours</strong>
                    <p>Add your business details and choose a voice.</p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>Give it a call</strong>
                    <p>
                      Try your agent in a three-minute browser conversation.
                    </p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>Shape what’s next</strong>
                    <p>Review the call and share what would make it useful.</p>
                  </div>
                </li>
              </ol>
              <div className={styles.actions}>
                <button
                  className={styles.primary}
                  onClick={() => open("studio")}
                >
                  Apply to Studio <ArrowUpRight size={18} />
                </button>
                <a className={styles.outline} href={`${studioUrl}/access`}>
                  Enter access code <ArrowRight size={18} />
                </a>
              </div>
              <small>
                Places are reviewed by our team. Studio is a testing and
                feedback space; it does not activate a phone service.
              </small>
            </div>
          </div>
        </section>
        <section className={styles.faq}>
          <div>
            <p className={styles.eyebrow}>A LITTLE CLARITY</p>
            <h2>FAQs</h2>
          </div>
          <div>
            {[
              [
                "What does Rev3 do?",
                "Rev3 is a voice technology company. We build products and services around the way people speak, listen and work. Voice agents are one service we offer. Studio is our co-creation programme, helping shape the wider products and experiences we develop next.",
              ],
              [
                "What’s the difference between the service and Studio?",
                "Build for me is for businesses that want us to deliver a voice agent service. Build with us is our co-creation programme: use Studio to test an agent and help shape what we build.",
              ],
              [
                "Can you work with our existing number and tools?",
                "We’ll check your current setup with you. Call routing, calendars, customer systems and messaging connections are scoped and tested as part of your service.",
              ],
              [
                "What happens when a caller needs a person?",
                "We agree the scenarios with you. Depending on your setup, the agent can arrange a callback or use an available transfer connection. It should never pretend it has completed something it cannot do.",
              ],
              [
                "How do I get into Studio?",
                "Apply with a few business details. If you’re invited, we’ll send an access code to your email. Already have one? Choose Enter access code.",
              ],
              [
                "Will callers know it’s AI?",
                "Yes. The agent introduces itself as an AI assistant. We design the experience to be clear about what it can do.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <Plus size={18} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className={styles.contact} id="contact">
          <div>
            <p className={styles.eyebrow}>LET’S TALK</p>
            <h2>
              Let’s build your
              <br />
              voice agent.
            </h2>
            <p>
              Tell us about your business. We’ll help you put voice to work.
            </p>
            <button className={styles.primary} onClick={() => open("service")}>
              Get in touch <ArrowUpRight size={18} />
            </button>
            <address>
              <a href="mailto:info@rev3.uk">info@rev3.uk</a>
              <p>
                Third Floor, 106 Bunhill Row
                <br />
                London EC1Y 8TZ
              </p>
            </address>
          </div>
          <div className={styles.map}>
            {mapLoaded?<iframe
              title="Rev3 London office"
              src="https://www.google.com/maps?q=106+Bunhill+Row,+London+EC1Y+8TZ&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />:<div className={styles.mapPlaceholder}><p>LONDON / EC1Y 8TZ</p><h3>Come say hello.</h3><p>106 Bunhill Row</p><button className={styles.outline} onClick={()=>setMapLoaded(true)}>Load map</button><small>Loads Google Maps.</small></div>}
            <a
              href="https://www.google.com/maps/search/?api=1&query=106+Bunhill+Row+London+EC1Y+8TZ"
              target="_blank"
              rel="noopener noreferrer"
            >
              Find us in London <ArrowUpRight size={16} />
            </a>
          </div>
        </section>
        <div className={styles.backing}>
          <span>Backed by</span>
          <Image
            src="/city-ventures.png"
            width={200}
            height={70}
            alt="City Ventures"
          />
        </div>
      </main>
      <footer className={styles.footer}>
        <a className={styles.brand} href="#top">
          <Image src="/rev3-logo.png" width={44} height={44} alt="Rev3" />
          <span>REV3</span>
        </a>
        <p>
          Voice technology.
          <br />
          Built for you. Built with you.
        </p>
        <div>
          <a href="#services">Voice agent service</a>
          <a href="#studio">Rev3 Studio</a>
          <a href="/company/privacy">Privacy</a>
          <a href="/company/terms">Terms</a>
        </div>
        <small>© {2026} Rev3</small>
      </footer>
      <dialog
        ref={dialog}
        className={styles.modal}
        onCancel={close}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <button
          className={styles.close}
          onClick={close}
          aria-label="Close form"
        >
          <X />
        </button>
        <p className={styles.eyebrow}>
          {form === "studio" ? "BUILD WITH US" : "LET’S BUILD SOMETHING USEFUL"}
        </p>
        <h2>
          {form === "studio"
            ? "Your business. Your perspective."
            : form === "service"
              ? "Let’s talk voice agents."
              : "Hello, Rev3."}
        </h2>
        <p>
          {form === "studio"
            ? "A few details to help us review your application."
            : "A few details so we can start with what matters to you."}
        </p>
        <form onSubmit={submit}>
          <label>
            Your name
            <input name="name" autoComplete="name" required maxLength={100} />
          </label>
          <label>
            Business name
            <input
              name="business"
              autoComplete="organization"
              required
              maxLength={160}
            />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          <label>
            Business type
            <select name="category" required defaultValue="">
              <option value="" disabled>
                Choose one
              </option>
              {[
                "Healthcare",
                "Property",
                "Trades & home services",
                "Automotive",
                "Professional services",
                "Retail & hospitality",
                "Other",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          {form==='studio'&&<>
            <label>Your role<input name="role" required maxLength={100} placeholder="Owner, manager..."/></label>
            {([
              ['callsPerWeek','Roughly how many calls per week?',['Under 20','20-100','101-500','Over 500','Not sure yet']],
              ['teamSize','Team size',['Just me','2-10','11-50','51+']],
              ['currentHandling','Who handles calls today?',['Me or my team','Receptionist','Answering service','Mostly missed / voicemail','Other']],
              ['goal','What would you test first?',['Bookings','Customer questions','Follow-ups','Admin tasks','Other']],
              ['readiness','When could you try Studio?',['This week','This month','Later']],
              ['feedback','Can you test it and share feedback?',['Yes','Not right now']]
            ] as [string,string,string[]][]).map(([name,label,options])=><label key={name}>{label}<select name={name} required defaultValue=""><option value="" disabled>Choose one</option>{options.map(value=><option key={value}>{value}</option>)}</select></label>)}
            <label>Tools you use (optional)<input name="tools" maxLength={500} placeholder="Booking system, CRM..."/></label>
          </>}
          <label className={styles.wide}>
            {form === "studio"
              ? "What would make Studio useful for your business?"
              : "What would you like help with?"}
            <textarea name="enquiry" rows={3} required maxLength={2000} />
          </label>
          <label className={styles.trap} aria-hidden="true">
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
          <p className={styles.wide}>
            We’ll use these details to respond to your{" "}
            {form === "studio" ? "application" : "enquiry"}.{" "}
            <a href="/company/privacy">Privacy notice</a>
          </p>
          <button className={styles.primary} disabled={busy}>
            {busy
              ? "Sending…"
              : form === "studio"
                ? "Send application"
                : "Send enquiry"}
            <ArrowRight size={16} />
          </button>
          <p className={styles.status} role="status">
            {message}
          </p>
        </form>
      </dialog>
    </div>
  );
}
