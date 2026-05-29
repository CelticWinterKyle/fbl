export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import DashboardContent from "@/components/DashboardContent";
import ErrorBoundary from "@/components/ErrorBoundary";
import { isOnboardingComplete, markOnboardingComplete, hasAnyConnection } from "@/lib/tokenStore/index";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // First-time users with nothing connected get the guided welcome flow. But anyone
  // who has already connected a league (e.g. via /connect, not the wizard) is
  // effectively onboarded — let them through and mark it so we don't recompute.
  if (!(await isOnboardingComplete(userId))) {
    if (await hasAnyConnection(userId)) {
      await markOnboardingComplete(userId);
    } else {
      redirect("/welcome");
    }
  }

  return (
    <ErrorBoundary>
      <DashboardContent />
    </ErrorBoundary>
  );
}
