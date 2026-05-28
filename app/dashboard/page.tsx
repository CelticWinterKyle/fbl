export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import DashboardContent from "@/components/DashboardContent";
import ErrorBoundary from "@/components/ErrorBoundary";
import { isOnboardingComplete } from "@/lib/tokenStore/index";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // First-time users who haven't been through setup get the guided welcome flow
  // instead of an empty dashboard. (/connect stays ungated so OAuth + the wizard work.)
  if (!(await isOnboardingComplete(userId))) redirect("/welcome");

  return (
    <ErrorBoundary>
      <DashboardContent />
    </ErrorBoundary>
  );
}
