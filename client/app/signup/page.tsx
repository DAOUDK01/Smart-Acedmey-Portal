"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { PremiumCard } from "@/components/premium-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import {
  getDashboardPath,
  savePortalSession,
  type PortalRole,
} from "@/lib/session";
import { findAuthUserByEmail, saveLocalAuthUser } from "@/lib/local-auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4010";

const roleOptions: Array<{ value: PortalRole; label: string }> = [
  { value: "STUDENT", label: "Student" },
  { value: "TEACHER", label: "Teacher" },
  { value: "EXPERT", label: "Expert" },
  { value: "GUARDIAN", label: "Guardian" },
];

const roleLabels = Object.fromEntries(
  roleOptions.map((option) => [option.value, option.label]),
) as Record<PortalRole, string>;

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<PortalRole>("TEACHER");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setIsSubmitting(true);

    try {
      if (!name.trim() || !email.trim() || !role) {
        throw new Error(
          "Fill in name, email, and role before creating the account.",
        );
      }

      let createdUser: {
        role: PortalRole;
        name: string;
        email: string;
        isActive: boolean;
      } | null = null;

      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            role,
            name,
            email,
            password,
          }),
        });

        if (!response.ok) {
          // Try to surface backend error details (validation messages or
          // exception messages) instead of only showing the numeric status.
          let backendMessage: string | null = null;
          try {
            const body = await response.json();
            if (Array.isArray(body?.message)) {
              backendMessage = body.message.join("; ");
            } else if (typeof body?.message === "string") {
              backendMessage = body.message;
            } else if (typeof body?.error === "string") {
              backendMessage = body.error;
            }
          } catch {
            // ignore parse errors
          }

          throw new Error(
            backendMessage ??
              `Account creation failed with status ${response.status}.`,
          );
        }

        await response.json();
        createdUser = {
          role,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          isActive: role === "ADMIN",
        };
      } catch (fetchError) {
        if (
          fetchError instanceof Error &&
          fetchError.message.startsWith("Account creation failed with status")
        ) {
          throw fetchError;
        }

        const existingUser = findAuthUserByEmail(email);
        if (existingUser) {
          throw new Error("Email already in use.");
        }

        const localUser = saveLocalAuthUser({
          role,
          name,
          email,
          isActive: role === "ADMIN",
        });

        createdUser = {
          role: localUser.role,
          name: localUser.name,
          email: localUser.email,
          isActive: localUser.isActive ?? role === "ADMIN",
        };
      }

      router.replace("/login?registered=1");
    } catch (signupError) {
      let errorMessage = "Sign up failed.";
      if (signupError instanceof Error) {
        errorMessage = signupError.message;
        if (errorMessage === "Failed to fetch") {
          errorMessage = "Unable to connect to the server. Please ensure the backend is running on port 4010.";
        }
      }
      setStatus(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="flex items-center justify-center bg-[radial-gradient(circle_at_bottom_right,_rgba(0,209,255,0.16),_transparent_28%),#0B1020] px-6 py-12">
        <div className="max-w-xl">
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/80">
            AI-native LMS
          </p>
          <h1 className="mt-4 text-5xl font-semibold leading-tight text-white">
            Create a future-ready academic workspace.
          </h1>
          <p className="mt-4 text-lg leading-8 text-slate-300">
            Launch your academy with checkpoint quizzes, premium dashboards, and
            guardian transparency.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <PremiumCard
              title="Responsive UX"
              description="Desktop, tablet, and mobile ready from day one."
              accent="from-cyan-500/20 to-transparent"
            />
            <PremiumCard
              title="Scalable stack"
              description="Next.js, NestJS, Prisma, and PostgreSQL."
              accent="from-accent-purple/20 to-transparent"
            />
          </div>
        </div>
      </section>
      <section className="flex items-center justify-center bg-ink-950 px-6 py-12">
        <Panel className="w-full max-w-md" glass={false}>
          <div>
            <h2 className="text-3xl font-semibold text-white">
              Create account
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Start with your school or academy profile.
            </p>
          </div>
          <form
            className="mt-8 space-y-4"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <Input
              placeholder="Full name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Input
              placeholder="Email address"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              placeholder="Password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Select
              value={role}
              onChange={(event) => setRole(event.target.value as PortalRole)}
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button type="submit" fullWidth disabled={isSubmitting}>
              {isSubmitting ? "Creating account..." : "Create account"}
            </Button>
          </form>
          {status ? (
            <Alert variant="neutral" className="mt-4">
              {status}
            </Alert>
          ) : null}
          <p className="mt-6 text-sm text-slate-400">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-white transition hover:text-accent-cyan"
            >
              Sign in
            </Link>
          </p>
        </Panel>
      </section>
    </div>
  );
}
