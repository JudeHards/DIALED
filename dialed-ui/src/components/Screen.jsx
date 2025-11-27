export default function Screen({ children }) {
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-[420px] px-4 pb-24 pt-4">
        {children}
      </main>
    </div>
  );
}
