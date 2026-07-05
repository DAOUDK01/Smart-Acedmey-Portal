import Link from "next/link";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B1020] px-6">
      <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-white/5 p-8 text-white shadow-soft backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/80">
          Account recovery
        </p>
        <h1 className="mt-4 text-3xl font-semibold">Reset access</h1>
        <p className="mt-2 text-sm text-slate-400">
          We will send a reset link to your registered email address.
        </p>
        <form className="mt-8 space-y-4">
          <input
            className="w-full rounded-2xl border border-white/10 bg-[#121826] px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/50"
            placeholder="Email address"
            type="email"
          />
          <button className="w-full rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-3 font-semibold text-white">
            Send reset link
          </button>
        </form>
        <p className="mt-6 text-sm text-slate-400">
          Back to{" "}
          <Link href="/login" className="text-white hover:text-cyan-300">
            sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
