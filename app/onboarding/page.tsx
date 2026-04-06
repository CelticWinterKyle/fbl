export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isOnboardingComplete } from "@/lib/tokenStore/index";
import OnboardingWizard from "./OnboardingWizard";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const done = await isOnboardingComplete(userId);
  if (done) redirect("/dashboard");

  return <OnboardingWizard />;
}
