import { notFound } from "next/navigation";
import AuthDiagnosticClient from "./AuthDiagnosticClient";

export const dynamic = "force-dynamic";

export default function AuthDiagnosticPage() {
  // Debug tooling — only available when DEBUG_ROUTES=1, 404s in production
  // like the debug API routes.
  if (process.env.DEBUG_ROUTES !== "1") notFound();

  return <AuthDiagnosticClient />;
}
