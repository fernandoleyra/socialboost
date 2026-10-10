export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading interviews">
      <div className="space-y-3 pb-2">
        <div className="skeleton h-9 w-56" />
        <div className="skeleton h-5 w-full max-w-xl" />
      </div>
      <div className="skeleton h-36 w-full rounded-panel" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-40 rounded-card" />
        ))}
      </div>
    </div>
  );
}
