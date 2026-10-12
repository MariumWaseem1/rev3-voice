import type { Metadata } from "next";
import { Company } from "@/components/company/company";
export const metadata: Metadata = {
  title: "Rev3 | Voice technology. Built for you. Built with you.",
  description:
    "Rev3 is a voice technology company building products and services around the way people speak, listen and work. Discover our services and Studio co-creation programme.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://rev3.uk" },
};
export default function CompanyPage() {
  return (
    <Company studioUrl={process.env.STUDIO_ORIGIN || "https://voice.rev3.uk"} />
  );
}
