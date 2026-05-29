export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import MyTeamContent from "@/components/MyTeamContent";
import ErrorBoundary from "@/components/ErrorBoundary";

export const metadata = { title: "My Team | League Blitz" };

export default async function MyTeamPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return (
    <ErrorBoundary>
      <MyTeamContent />
    </ErrorBoundary>
  );
}
