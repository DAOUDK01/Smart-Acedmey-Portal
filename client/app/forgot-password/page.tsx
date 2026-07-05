import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-6">
      <Panel className="w-full max-w-md" glass={false}>
        <Eyebrow>Account recovery</Eyebrow>
        <h1 className="mt-4 text-3xl font-semibold">Reset access</h1>
        <p className="mt-2 text-sm text-slate-400">
          We will send a reset link to your registered email address.
        </p>
        <form className="mt-8 space-y-4">
          <Input placeholder="Email address" type="email" />
          <Button type="submit" fullWidth>
            Send reset link
          </Button>
        </form>
        <p className="mt-6 text-sm text-slate-400">
          Back to{" "}
          <Link href="/login" className="text-white hover:text-accent-cyan">
            sign in
          </Link>
        </p>
      </Panel>
    </div>
  );
}
