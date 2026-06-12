import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import Logo from "@/components/Logo";
import { clerkAppearance } from "@/lib/clerkAppearance";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center -mx-6 -mt-8 px-6 bg-pitch-950">
      {/* Logo */}
      <Link href="/" className="mb-8 hover:opacity-85 transition-opacity" aria-label="League Blitz home">
        <Logo className="h-24 w-auto text-accent" />
      </Link>

      <SignUp fallbackRedirectUrl="/welcome" appearance={clerkAppearance} />
    </div>
  );
}
