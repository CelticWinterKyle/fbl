export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AwardsContent from "@/components/AwardsContent";

export const metadata = { title: "Rankings & Awards | Family Business" };

export default async function RankingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return <AwardsContent />;
}
