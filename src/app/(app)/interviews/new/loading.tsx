export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8" aria-busy="true" aria-label="Loading">
      <div className="space-y-3 pb-2">
        <div className="skeleton h-4 w-28" />
        <div className="skeleton h-9 w-48" />
        <div className="skeleton h-5 w-full max-w-xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="skeleton h-44 rounded-card" />
        <div className="skeleton h-44 rounded-card" />
      </div>
      <div className="skeleton h-48 rounded-panel" />
    </div>
  );
}
