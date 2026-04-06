export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import MyTeamContent from "@/components/MyTeamContent";

export const metadata = { title: "My Team | Family Business" };

export default async function MyTeamPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return <MyTeamContent />;
}
