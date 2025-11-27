// src/components/TopBar.jsx
export default function TopBar({ title, right }) {
  return (
    <header className="sticky top-0 z-20 bg-slate-900/70 backdrop-blur border-b border-slate-800">
      <div className="mx-auto max-w-[420px] px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {right ?? <span className="text-slate-500 text-sm">&nbsp;</span>}
      </div>
    </header>
  );
}

