// src/pages/Welcome.jsx
import { Link } from "react-router-dom";
import TopBar from "../components/TopBar";
import Screen from "../components/Screen";
import { Play, ListChecks, Dumbbell, ChevronRight } from "lucide-react";

export default function Welcome() {
  return (
    <>
      <TopBar title="Welcome" />
      <Screen>
        {/* Hero - sleek / gritty */}
        <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-lg">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-100">Dialed</h1>
          <div className="mt-3 h-0.5 w-14 rounded bg-blue-700/60" />
          <p className="mt-3 text-xs uppercase tracking-wider text-slate-400">
            Your training, simplified.
          </p>
        </section>

        {/* Actions */}
        <section className="mt-6 grid gap-3">
          <ActionCard
            to="/start-workout"
            title="Start a session"
            desc="Pick a routine and begin"
          />
          <ActionCard
            to="/routines"
            title="Manage routines"
            desc="Create, edit, and organize"
          />
          <ActionCard
            to="/workout"
            title="View workout"
            desc="See exercise details"
          />
        </section>
      </Screen>
    </>
  );
}

function ActionCard({ to, title, desc, accent = false }) {
  return (
    <Link
      to={to}
      className={[
        "group flex items-center justify-between rounded-2xl border px-4 py-4 transition",
        accent
          ? "border-emerald-700/60 bg-emerald-600/15 hover:bg-emerald-600/25"
          : "border-slate-800 bg-slate-900/60 hover:bg-slate-900/80",
      ].join(" ")}
    >
      <div>
        <div className="font-medium text-slate-100">{title}</div>
        <div className="text-sm text-slate-400">{desc}</div>
      </div>
      <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-slate-300 transition" />
    </Link>
  );
}
