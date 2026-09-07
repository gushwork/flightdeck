import { redirect } from "next/navigation";
import { legacyDashboardRedirect } from "@/lib/dashboard/legacy-redirect";

export default function SecretsOverviewRedirectPage() {
  redirect(legacyDashboardRedirect("/secrets/overview", {}));
}
