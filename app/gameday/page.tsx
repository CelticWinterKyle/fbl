export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import GameDayContent from "@/components/GameDayContent";
import ErrorBoundary from "@/components/ErrorBoundary";
import { isOnboardingComplete } from "@/lib/tokenStore/index";

export const metadata = { title: "Game Day | Family Business" };

export default async function GameDayPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  if (!(await isOnboardingComplete(userId))) redirect("/welcome");

  return (
    <ErrorBoundary>
      <GameDayContent />
    </ErrorBoundary>
  );
}
