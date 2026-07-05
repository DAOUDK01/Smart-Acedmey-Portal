import Link from "next/link";
import { aiWorkflow, featureCards, stats } from "@/lib/data";
import { PremiumCard } from "@/components/premium-card";
import { buttonVariants } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-hero-gradient text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <header className="surface-panel motion-fade flex items-center justify-between rounded-full px-5 py-3">
          <div>
            <Eyebrow>Smart Academy Portal</Eyebrow>
            <p className="text-sm text-slate-400">
              Built for people who teach and learn
            </p>
          </div>
          <div className="hidden gap-2 md:flex">
            <Link
              className={buttonVariants({ variant: "ghost", size: "pill" })}
              href="/login"
            >
              Sign in
            </Link>
            <Link
              className={cn(
                buttonVariants({ variant: "primary", size: "pill" }),
                "shadow-none",
              )}
              href="/signup"
            >
              Create account
            </Link>
          </div>
        </header>

        <section className="motion-rise grid gap-8 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <span className="inline-flex rounded-full border border-accent-purple/20 bg-accent-purple/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.3em] text-accent-purple">
              Checkpoint-driven learning journey
            </span>
            <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-tight text-white md:text-7xl">
              Learn with clarity. Teach with confidence.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              A focused learning platform where students follow clear paths,
              teachers guide progress, and guardians stay informed without
              noise.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                className={buttonVariants({ variant: "primary", size: "pill" })}
                href="/login"
              >
                Sign in
              </Link>
              <Link
                className={buttonVariants({ variant: "outline", size: "pill" })}
                href="/signup"
              >
                Create account
              </Link>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((item) => (
                <PremiumCard
                  key={item.label}
                  title={item.value}
                  description={item.label}
                  accent="from-white/10 to-white/5"
                >
                  <p className="text-sm font-medium text-emerald-300">
                    {item.delta} this month
                  </p>
                </PremiumCard>
              ))}
            </div>
          </div>

          <PremiumCard
            eyebrow="Portal preview"
            title="A calmer, clearer control center"
            description="Track progress, course coverage, and quiz quality with concise panels designed for daily use."
            accent="from-accent-purple/30 to-accent-cyan/20"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-ink-900 p-4">
                  <p className="text-xs text-slate-400">Learner engagement</p>
                  <p className="mt-2 text-2xl font-semibold text-white">96%</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-ink-900 p-4">
                  <p className="text-xs text-slate-400">Quiz accuracy</p>
                  <p className="mt-2 text-2xl font-semibold text-white">87%</p>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-ink-900 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-sky-200/80">
                  Learning workflow
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-200">
                  {aiWorkflow.map((item, index) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5"
                    >
                      {index + 1}. {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </PremiumCard>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {featureCards.map((card) => (
            <PremiumCard
              key={card.title}
              eyebrow="Core feature"
              title={card.title}
              description={card.description}
              accent={
                card.accent === "cyan"
                  ? "from-cyan-400/25 to-transparent"
                  : card.accent === "success"
                    ? "from-emerald-400/20 to-transparent"
                    : card.accent === "warning"
                      ? "from-amber-400/20 to-transparent"
                      : card.accent === "danger"
                        ? "from-rose-400/20 to-transparent"
                        : "from-violet-400/25 to-transparent"
              }
            />
          ))}
        </section>
      </div>
    </div>
  );
}
