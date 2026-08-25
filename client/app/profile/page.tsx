"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, KeyRound, Save, User as UserIcon } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PremiumCard } from "@/components/premium-card";
import { apiFetch, refreshAccessToken } from "@/lib/api";
import {
  getDashboardPath,
  isAccessTokenValidForRole,
  loadAccessToken,
  loadPortalSession,
  savePortalSession,
  type PortalSession,
} from "@/lib/session";

type MeProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
  phoneNumber: string | null;
  avatarUrl: string | null;
  isActive: boolean;
};

const roleLabels: Record<string, string> = {
  ADMIN: "Admin",
  TEACHER: "Teacher",
  STUDENT: "Student",
  GUARDIAN: "Guardian",
};

export default function ProfilePage() {
  const router = useRouter();
  const [session, setSession] = useState<PortalSession | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      const currentSession = loadPortalSession();
      if (!currentSession) {
        router.replace("/login");
        return;
      }

      let token = loadAccessToken();
      if (!token || !isAccessTokenValidForRole(token, currentSession.role)) {
        token = await refreshAccessToken();
      }
      if (!active) return;

      if (!token || !isAccessTokenValidForRole(token, currentSession.role)) {
        router.replace("/login");
        return;
      }

      setSession(currentSession);
      setReady(true);

      try {
        const me = await apiFetch<MeProfile>("/api/me");
        if (!active) return;
        setProfile(me);
        setName(me.name);
        setPhoneNumber(me.phoneNumber ?? "");
        setAvatarUrl(me.avatarUrl ?? "");
        if (me.name !== currentSession.name) {
          savePortalSession({ ...currentSession, name: me.name });
        }
      } catch {
        if (active) setError("Could not load your profile details.");
      }
    }

    void checkAccess();
    return () => {
      active = false;
    };
  }, [router]);

  const handleSaveProfile = useCallback(async () => {
    if (!name.trim()) {
      setMessage({ kind: "error", text: "Name cannot be empty." });
      return;
    }

    setSavingProfile(true);
    setMessage(null);
    try {
      const updated = await apiFetch<MeProfile>("/api/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          phoneNumber: phoneNumber.trim() || undefined,
          avatarUrl: avatarUrl.trim() || undefined,
        }),
      });
      setProfile(updated);
      if (session) savePortalSession({ ...session, name: updated.name });
      setMessage({ kind: "success", text: "Profile updated successfully." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Failed to update profile." });
    } finally {
      setSavingProfile(false);
    }
  }, [name, phoneNumber, avatarUrl, session]);

  const handleChangePassword = useCallback(async () => {
    if (!currentPassword || !newPassword) {
      setMessage({ kind: "error", text: "Please fill in all password fields." });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ kind: "error", text: "New password must be at least 6 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ kind: "error", text: "New password and confirmation do not match." });
      return;
    }

    setChangingPassword(true);
    setMessage(null);
    try {
      const result = await apiFetch<{ message: string }>("/api/me/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage({ kind: "success", text: result.message });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Failed to change password." });
    } finally {
      setChangingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

  if (!ready) return null;
  if (!session) return null;

  const dashboardPath = getDashboardPath(session.role);

  return (
    <div className="min-h-screen page-canvas text-slate-800">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <Link
          href={dashboardPath}
          className="inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </Link>

        <div className="mt-8">
          <Eyebrow className="text-slate-500">My Account</Eyebrow>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900">
            Profile Settings
          </h1>
          <p className="mt-2 text-slate-500">
            Update your personal details and change your password.
          </p>
        </div>

        {message ? (
          <Alert variant={message.kind} className="mt-6">
            {message.text}
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="error" className="mt-6">
            {error}
          </Alert>
        ) : null}

        <div className="mt-8 flex flex-col gap-6">
          <PremiumCard
            eyebrow="Personal Information"
            title="Edit Profile"
            description="Your name, phone number and profile picture are shown across the portal."
          >
            <div className="mt-6 flex items-center gap-5 rounded-2xl bg-accent-purple/[0.06] p-5">
              {profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt="Profile"
                  className="h-14 w-14 shrink-0 rounded-full object-cover shadow-[0_2px_8px_rgba(15,23,42,0.2)]"
                />
              ) : (
                <Avatar name={profile?.name || session.name} size="lg" />
              )}
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-white">
                  {profile?.name || session.name}
                </p>
                <p className="mt-0.5 truncate text-sm text-slate-500">
                  {roleLabels[session.role] ?? session.role} · {session.email}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-5">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Full Name
                </label>
                <div className="mt-2">
                  <Input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your full name"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Email
                </label>
                <div className="mt-2">
                  <Input
                    type="email"
                    value={profile?.email ?? session.email}
                    disabled
                    className="opacity-60"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Email cannot be changed.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Role
                </label>
                <div className="mt-2">
                  <Input
                    type="text"
                    value={roleLabels[session.role] ?? session.role}
                    disabled
                    className="opacity-60"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Phone Number
                </label>
                <div className="mt-2">
                  <Input
                    type="tel"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                    placeholder="+92 300 1234567"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Profile Picture URL
                </label>
                <div className="mt-2">
                  <Input
                    type="url"
                    value={avatarUrl}
                    onChange={(event) => setAvatarUrl(event.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                  />
                </div>
              </div>

              <div className="mt-2">
                <Button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                >
                  <Save size={16} className="mr-2" />
                  {savingProfile ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </PremiumCard>

          <PremiumCard
            eyebrow="Security"
            title="Change Password"
            description="Use a strong password you do not use elsewhere."
          >
            <div className="mt-6 flex flex-col gap-5">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Current Password
                </label>
                <div className="mt-2">
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    placeholder="Enter your current password"
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  New Password
                </label>
                <div className="mt-2">
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Confirm New Password
                </label>
                <div className="mt-2">
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat the new password"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="mt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                >
                  <KeyRound size={16} className="mr-2" />
                  {changingPassword ? "Updating..." : "Update Password"}
                </Button>
              </div>
            </div>
          </PremiumCard>
        </div>

        <div className="mt-8 flex items-center gap-2 text-xs text-slate-500">
          <UserIcon size={14} />
          Signed in as {session.name} ({roleLabels[session.role] ?? session.role})
        </div>
      </div>
    </div>
  );
}