import type { Metadata } from "next";
import { Company } from "@/components/company/company";
export const metadata: Metadata = {
  title: "Rev3 | Voice technology. Built for you. Built with you.",
  description:
    "Voice technology for real businesses. Let Rev3 build your voice agent, or help shape what comes next in our Studio co-creation programme.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://rev3.uk" },
};
export default function CompanyPage() {
  return (
    <Company studioUrl={process.env.STUDIO_ORIGIN || "https://voice.rev3.uk"} />
  );
}
