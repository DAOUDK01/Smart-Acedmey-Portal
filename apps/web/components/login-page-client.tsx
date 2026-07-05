"use client";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { PremiumCard } from "@/components/premium-card";
import {
  getDashboardPath,
  savePortalSession,
  type PortalRole,
} from "@/lib/session";
import { listAvailableAuthUsers } from "@/lib/local-auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4010";

const roleLabels: Record<PortalRole, string> = {
  ADMIN: "Admin",
  TEACHER: "Teacher",
  STUDENT: "Student",
  GUARDIAN: "Guardian",
  EXPERT: "Expert",
};

export function LoginPageClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("error") === "pending_approval") {
        setStatus("Your account is pending admin approval. Please wait for an administrator to activate it.");
      }
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setIsSubmitting(true);

    try {
      let matchedUser: {
        role: PortalRole;
        name: string;
        email: string;
        isActive: boolean;
      } | null = null;

      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/users/by-email/${encodeURIComponent(email.trim())}`);
        if (!response.ok) {
          if (response.status === 404) {
             throw new Error("No account was found for that email address.");
          }
          throw new Error(`Sign in failed with status ${response.status}.`);
        }

        matchedUser = (await response.json()) as {
          role: PortalRole;
          name: string;
          email: string;
          isActive: boolean;
        };
      } catch (fetchError) {
        if (
          fetchError instanceof Error &&
          (fetchError.message.startsWith("Sign in failed with status") || fetchError.message === "No account was found for that email address.")
        ) {
          throw fetchError;
        }

        const users = listAvailableAuthUsers();
        matchedUser = users.find(
          (user) => user.email.toLowerCase() === email.trim().toLowerCase(),
        ) as any;
      }

      if (!matchedUser) {
        throw new Error("No account was found for that email address.");
      }

      if (!matchedUser.isActive && matchedUser.role !== "ADMIN") {
        throw new Error("Your account is pending admin approval. Please wait for an administrator to activate it.");
      }

      if (!password.trim()) {
        throw new Error("Enter your password to continue.");
      }

      savePortalSession({
        role: matchedUser.role,
        name: matchedUser.name,
        email: matchedUser.email,
        isActive: matchedUser.isActive,
        mode: "real",
      });

      setStatus(
        `Signed in as ${matchedUser.name} (${roleLabels[matchedUser.role]}).`,
      );
      router.replace(getDashboardPath(matchedUser.role));
    } catch (loginError) {
      let errorMessage = "Sign in failed.";
      if (loginError instanceof Error) {
        errorMessage = loginError.message;
        if (errorMessage === "Failed to fetch") {
          errorMessage = "Unable to connect to the server. Please ensure the backend is running on port 4010.";
        }
      }
      setStatus(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const existing = document.getElementById("gsi-script");
    if (!existing) {
      const script = document.createElement("script");
      script.id = "gsi-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);

      script.onload = () => {
        // @ts-ignore
        if (typeof window !== "undefined" && (window as any).google) {
          // @ts-ignore
          (window as any).google.accounts.id.initialize({
            client_id: clientId,
            callback: (resp: any) => void handleGoogleCredential(resp),
          });
          // @ts-ignore
          (window as any).google.accounts.id.renderButton(
            document.getElementById("g_id_signin"),
            { theme: "outline", size: "large", type: "standard" },
          );
        }
      };
    }

    return () => {
      const btn = document.getElementById("g_id_signin");
      if (btn) btn.innerHTML = "";
    };
  }, []);

  async function handleGoogleCredential(resp: any) {
    if (!resp?.credential) {
      setStatus("Google sign-in failed.");
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const body = { idToken: resp.credential };
      const r = await fetch(`${API_BASE_URL}/api/auth/google/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`Sign in failed: ${r.status} ${txt}`);
      }

      const data = await r.json();

      savePortalSession({
        role: data.role,
        name: data.name,
        email: data.email,
        isActive: data.isActive ?? true, // Assume active if google sign in succeeded or handled by backend
        mode: "real",
      });

      // store access token for authenticated requests
      try {
        if (typeof window !== "undefined" && data.accessToken) {
          window.localStorage.setItem(
            "smart-academy:access-token",
            data.accessToken,
          );
        }
      } catch {}

      router.replace(getDashboardPath(data.role));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Google sign-in failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="motion-rise flex items-center justify-center px-6 py-12">
        <div className="max-w-xl">
          <p className="text-xs uppercase tracking-[0.35em] text-sky-200/80">
            Smart Academy Portal
          </p>
          <h1 className="mt-4 text-5xl font-semibold leading-tight text-white">
            Welcome back to your learning space.
          </h1>
          <p className="mt-4 text-lg leading-8 text-slate-300">
            Continue your courses, track your progress, and stay connected with
            teachers and guardians in one simple portal.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <PremiumCard
              title="Guided progress"
              description="Checkpoint-based flow that helps you stay on track."
              accent="from-sky-500/20 to-transparent"
            />
            <PremiumCard
              title="Trusted access"
              description="Role-based dashboards with secure sign-in."
              accent="from-emerald-500/20 to-transparent"
            />
          </div>
        </div>
      </section>
      <section className="motion-fade flex items-center justify-center px-6 py-12">
        <div className="surface-panel w-full max-w-md rounded-[32px] p-8">
          <div>
            <h2 className="text-3xl font-semibold text-white">Sign in</h2>
            <p className="mt-2 text-sm text-slate-400">
              Sign in with the email you used when creating the account.
            </p>
          </div>
          <form
            className="mt-8 space-y-4"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <input
              className="w-full rounded-2xl border border-white/10 bg-[#121826] px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
              placeholder="Email address"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <input
              className="w-full rounded-2xl border border-white/10 bg-[#121826] px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
              placeholder="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              className="w-full rounded-2xl bg-gradient-to-r from-sky-500 to-teal-400 px-4 py-3 font-semibold text-white shadow-soft transition hover:translate-y-[-1px]"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
          {status ? (
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              {status}
            </p>
          ) : null}
          {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
            <div className="mt-6" id="g_id_signin" />
          ) : (
            <div className="mt-6">
              <button
                type="button"
                onClick={() =>
                  setStatus(
                    "Google sign-in not configured. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in apps/web/.env.local and restart the dev server.",
                  )
                }
                className="w-full rounded-2xl border border-white/10 bg-[#1f2937] px-4 py-3 text-white transition"
              >
                Sign in with Google (configure first)
              </button>
            </div>
          )}
          <div className="mt-6 flex items-center justify-center text-sm text-slate-400">
            <a href="/signup" className="transition hover:text-white">
              Don't have an account? Create one
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
