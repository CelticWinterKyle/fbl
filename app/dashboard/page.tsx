export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isOnboardingComplete } from "@/lib/tokenStore/index";
import DashboardContent from "@/components/DashboardContent";
import ErrorBoundary from "@/components/ErrorBoundary";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const done = await isOnboardingComplete(userId);
  if (!done) redirect("/welcome");

  return (
    <ErrorBoundary>
      <DashboardContent />
    </ErrorBoundary>
  );
}
