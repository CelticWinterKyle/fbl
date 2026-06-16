import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/adminAuth";
import AdminContent from "@/components/AdminContent";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin | League Blitz" };

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId || !isAdmin(userId)) redirect("/");

  return <AdminContent />;
}
