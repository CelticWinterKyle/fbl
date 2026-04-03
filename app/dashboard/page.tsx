export const dynamic = 'force-dynamic';
export const revalidate = 0;

import DashboardContent from "@/components/DashboardContent";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function DashboardPage() {
  return (
    <ErrorBoundary>
      <DashboardContent />
    </ErrorBoundary>
  );
}
