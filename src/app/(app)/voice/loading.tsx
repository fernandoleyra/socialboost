export default function VoiceLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading your voice">
      <div className="space-y-2 pb-6">
        <div className="skeleton h-4 w-16" />
        <div className="skeleton h-9 w-48" />
        <div className="skeleton h-5 w-full max-w-xl" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="card h-[118px] p-4">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton mt-3 h-7 w-16" />
            <div className="skeleton mt-3 h-1.5 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="card h-72" />
        <div className="card h-72" />
      </div>
    </div>
  );
}
