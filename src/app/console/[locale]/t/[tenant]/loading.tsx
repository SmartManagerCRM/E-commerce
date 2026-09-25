export default function ConsoleLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6" aria-busy="true">
      <div className="h-8 w-48 animate-pulse rounded-md bg-border/60" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-border/40" />
        ))}
      </div>
    </div>
  );
}
