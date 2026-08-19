export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Weekly Recap" };

import RecapContent from "@/components/RecapContent";

export default function RecapPage() {
  return <RecapContent />;
}
