import { NavLink } from "react-router-dom";
import { Home, Dumbbell, ListChecks } from "lucide-react";

function Tab({ to, label, Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "flex flex-1 min-w-0 items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm transition",
          isActive ? "bg-slate-800/70 text-slate-100"
                   : "text-slate-400 hover:bg-slate-800/40",
        ].join(" ")
      }
      aria-label={label}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

export default function BottomMenu() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50">
      <div className="mx-auto max-w-md px-4 pb-4">
        <div className="w-full rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur px-2 py-2 flex items-center gap-2">
          {/* EXACT match so Home only matches "/" */}
          <Tab to="/" label="Home" Icon={Home} end />
          <Tab to="/routines" label="Routines" Icon={ListChecks} />
          <Tab to="/workout" label="Workout" Icon={Dumbbell} />
        </div>
      </div>
    </nav>
  );
}
