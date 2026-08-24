import { redirect } from "next/navigation";
import { legacyDashboardRedirect } from "@/lib/dashboard/legacy-redirect";

export default function AwsRedirectPage() {
  redirect(legacyDashboardRedirect("/aws", {}));
}
