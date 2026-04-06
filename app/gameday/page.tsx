export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import GameDayContent from "@/components/GameDayContent";

export const metadata = { title: "Game Day | Family Business" };

export default async function GameDayPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return <GameDayContent />;
}
