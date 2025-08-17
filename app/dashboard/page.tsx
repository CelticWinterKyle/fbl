export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
import DashboardContent from "@/components/DashboardContent";

export default async function DashboardPage() {
  return <DashboardContent />;
}
