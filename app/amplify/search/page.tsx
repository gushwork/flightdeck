import { redirect } from "next/navigation";
import { legacyDashboardRedirect } from "@/lib/dashboard/legacy-redirect";

export default async function AmplifySearchRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyDashboardRedirect("/amplify/search", await searchParams));
}
