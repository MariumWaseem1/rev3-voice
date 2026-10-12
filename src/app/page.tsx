import { Platform } from "@/components/platform";
import CompanyPage, { metadata as companyMetadata } from "./company/page";
export const dynamic = "force-dynamic";
export function generateMetadata() {
  return process.env.SITE_ROLE === "marketing"
    ? companyMetadata
    : { title: "Rev3 Studio", robots: { index: false, follow: false } };
}
export default function Page() {
  return process.env.SITE_ROLE === "marketing" ? <CompanyPage /> : <Platform />;
}
