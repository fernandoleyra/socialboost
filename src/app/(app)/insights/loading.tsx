export default function InsightsLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading insights">
      <div className="space-y-2 pb-6">
        <div className="skeleton h-10 w-40" />
        <div className="skeleton h-5 w-[28rem] max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card space-y-3 p-4">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="card space-y-4 p-5">
            <div className="skeleton h-5 w-40" />
            {Array.from({ length: 4 }, (_, j) => (
              <div key={j} className="skeleton h-3" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
