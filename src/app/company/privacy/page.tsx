import Link from "next/link";
export default function Page() {
  const sections = [
    "Studio review and analytics\nAuthorised Rev3 team members can review account sign-ups, saved conversations, booking activity and feedback to support users and improve Studio. Product analytics may be processed with PostHog when enabled. Conversation text, contact details and booking contents are not sent to PostHog by this integration. The admin dashboard is restricted to approved owner accounts.",
    "\nInformation we collect\nWhen you submit an enquiry, we may collect your name, business name, email address, phone number and the information you include in your message. We may also receive basic technical information needed to operate and protect the website, such as request logs, browser type and approximate device information.",
    "\nHow we use it\nWe use enquiry information to respond to you, arrange demonstrations or meetings, understand what you are looking for and take steps towards providing our services. We use limited technical information to keep the website reliable, secure and working correctly.",
    "\nOur legal reasons\nDepending on the circumstances, we process information because you have asked us to take steps before entering into a contract, because it is necessary for our legitimate interests in responding to enquiries and operating our website, or because you have given consent.",
    "\nWho receives information\nWe only share information with service providers that help us operate the website and deliver enquiries, where necessary. These providers process information on our behalf under appropriate arrangements. We do not sell personal information.",
    "\nGoogle Maps\nOur contact section includes an embedded Google map. Google may receive technical information or place cookies when you load or interact with the map. The map loads only when you choose Load map. You can use the written address instead.",
    "\nHow long we keep it\nWe keep enquiry information only for as long as reasonably necessary to respond, manage the relationship, meet legal obligations and resolve disputes. Technical records are kept only for the period needed for security and service operation.",
    "\nYour rights\nDepending on the law and circumstances, you may ask for access to your information, correction, deletion, restriction, portability or object to its use. Where processing relies on consent, you may withdraw that consent.",
    "\nContact and complaints\nFor privacy questions or requests, email info@rev3.uk. You may also raise a concern with the UK Information Commissioner\u2019s Office.",
    "\nChanges to this policy\nWe may update this policy when our website, services or legal obligations change. Last updated: 12 October 2026.",
    "Studio applications and invitations\nWe save your name, email, business details and enquiry to review your application or respond to your request. We use Resend to deliver emails. Website enquiries are retained for up to 90 days in our application database. Approved Studio membership is retained to manage access. Studio call records follow the separate Studio retention notice. Contact info@rev3.uk about access or deletion.",
  ];
  return (
    <main style={{ maxWidth: 850, margin: "auto", padding: "60px 25px" }}>
      <Link href="/company">← Rev3</Link>
      <h1>Privacy</h1>
      {sections.map((s, i) => (
        <section key={i} style={{ marginTop: 30, whiteSpace: "pre-line" }}>
          {s}
        </section>
      ))}
    </main>
  );
}
