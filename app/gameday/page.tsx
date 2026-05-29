export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import GameDayContent from "@/components/GameDayContent";
import ErrorBoundary from "@/components/ErrorBoundary";
import { isOnboardingComplete, markOnboardingComplete, hasAnyConnection } from "@/lib/tokenStore/index";

export const metadata = { title: "Game Day | Family Business" };

export default async function GameDayPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Connected users (even via /connect rather than the wizard) are onboarded.
  if (!(await isOnboardingComplete(userId))) {
    if (await hasAnyConnection(userId)) {
      await markOnboardingComplete(userId);
    } else {
      redirect("/welcome");
    }
  }

  return (
    <ErrorBoundary>
      <GameDayContent />
    </ErrorBoundary>
  );
}
