export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import OddsContent from "@/components/OddsContent";
import ErrorBoundary from "@/components/ErrorBoundary";
import { isOnboardingComplete, markOnboardingComplete, hasAnyConnection } from "@/lib/tokenStore/index";

export const metadata = { title: "Odds | League Blitz" };

export default async function OddsPage() {
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
      <OddsContent />
    </ErrorBoundary>
  );
}
