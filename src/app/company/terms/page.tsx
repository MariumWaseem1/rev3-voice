import Link from "next/link";
export default function Page() {
  const sections = [
    "\nAbout this website\nThis website introduces Rev3 and allows businesses to request information, demonstrations and meetings. Website content is general information only. A request submitted through the website does not create a customer contract or guarantee that a service will be available.",
    "\nUsing the website\nYou may use the website only for lawful purposes. You must not attempt to disrupt it, gain unauthorised access, introduce malicious code, misuse forms or use the website in a way that infringes another person\u2019s rights.",
    "\nService information\nExamples, demonstrations, integrations and outcomes shown on the website illustrate possible uses of Rev3. Actual features, configuration and results depend on the agreed service, the customer\u2019s systems and the relevant implementation.",
    "\nIntellectual property\nThe website design, branding, text, graphics and software are owned by Rev3 or used with permission. You may view the website for your own business information, but you may not copy, republish or commercially exploit its content without permission.",
    "\nThird-party services\nThe website may contain links to or embedded content from third parties, including mapping services. Those services operate under their own terms and policies. Rev3 is not responsible for third-party websites or services.",
    "\nWebsite availability\nWe aim to keep the website accurate and available, but we do not promise uninterrupted access or that every item will always be complete or current. We may update, suspend or withdraw website content when necessary.",
    "\nLiability\nNothing in these terms excludes liability that cannot lawfully be excluded. To the extent permitted by law, Rev3 is not responsible for loss caused by relying on general website content, inability to access the website or use of a third-party service.",
    "\nPrivacy\nOur Privacy Policy explains how information submitted through the website is handled.",
    "\nGoverning law\nThese website terms are governed by the laws of England and Wales. The courts of England and Wales will have jurisdiction, subject to any rights that applicable law gives you.",
    "\nContact\nQuestions about these terms can be sent to info@rev3.uk.",
  ];
  return (
    <main style={{ maxWidth: 850, margin: "auto", padding: "60px 25px" }}>
      <Link href="/company">← Rev3</Link>
      <h1>Terms</h1>
      {sections.map((s, i) => (
        <section key={i} style={{ marginTop: 30, whiteSpace: "pre-line" }}>
          {s}
        </section>
      ))}
    </main>
  );
}
