"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_BASE_URL } from "@/lib/api";
import {
  saveAccessToken,
  savePortalSession,
  saveRefreshToken,
} from "@/lib/session";

export function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message ?? "Admin sign-in failed");
      }

      saveAccessToken(data.accessToken);
      saveRefreshToken(data.refreshToken);
      savePortalSession({
        role: "ADMIN",
        name: data.user.name,
        email: data.user.email,
        isActive: true,
        mode: "real",
      });
      router.replace("/admin");
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Unable to sign in to the admin portal",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b16] px-6 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(124,58,237,0.18),transparent_35%),radial-gradient(circle_at_80%_75%,rgba(14,165,233,0.14),transparent_35%)]" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl shadow-violet-950/30 backdrop-blur-xl lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden flex-col justify-between border-r border-white/10 bg-gradient-to-br from-violet-600/20 via-transparent to-sky-500/10 p-12 lg:flex">
          <div className="flex items-center gap-3 text-white">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/20 ring-1 ring-violet-300/20">
              <ShieldCheck className="h-6 w-6 text-violet-200" />
            </span>
            <span className="text-sm font-semibold uppercase tracking-[0.24em]">Smart Academy</span>
          </div>
          <div>
            <p className="text-sm font-medium text-violet-200">Restricted administration</p>
            <h1 className="mt-4 max-w-md text-5xl font-semibold leading-tight text-white">
              Control your academy from one secure workspace.
            </h1>
            <p className="mt-5 max-w-md leading-7 text-slate-300">
              Manage users, courses, approvals, analytics, and platform operations.
            </p>
          </div>
          <p className="text-xs text-slate-500">Authorized administrators only</p>
        </section>

        <section className="p-8 sm:p-12">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/20">
            <LockKeyhole className="h-5 w-5 text-violet-200" />
          </div>
          <h2 className="mt-7 text-3xl font-semibold text-white">Admin sign in</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Enter the administrator credentials supplied by the platform owner.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Admin email</label>
              <Input
                type="email"
                autoComplete="username"
                placeholder="admin@smartacademy.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Password</label>
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error ? <Alert variant="error">{error}</Alert> : null}
            <Button type="submit" fullWidth disabled={submitting}>
              {submitting ? "Verifying access..." : "Enter admin portal"}
            </Button>
          </form>

          <div className="mt-8 border-t border-white/10 pt-6 text-center text-sm text-slate-500">
            Not an administrator?{" "}
            <Link href="/login" className="font-medium text-violet-300 hover:text-violet-200">
              User sign in
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
