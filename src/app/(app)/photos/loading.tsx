export default function LoadingPhotos() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading your photos">
      <div className="space-y-2 pb-6">
        <div className="skeleton h-3 w-20" />
        <div className="skeleton h-9 w-52" />
        <div className="skeleton h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="skeleton h-64 rounded-panel!" />
        <div className="skeleton h-64 rounded-panel!" />
      </div>
      <div className="columns-1 gap-4 min-[420px]:columns-2 md:columns-3 xl:columns-4">
        {[220, 300, 180, 260, 240, 200, 280, 190].map((h, i) => (
          <div key={i} className="skeleton mb-4 w-full break-inside-avoid rounded-card!" style={{ height: h }} />
        ))}
      </div>
    </div>
  );
}
