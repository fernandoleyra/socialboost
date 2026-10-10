export default function LoadingMemories() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading your stories">
      <div className="space-y-2 pb-6">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-9 w-56" />
        <div className="skeleton h-4 w-full max-w-xl" />
      </div>
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="skeleton h-10 w-full rounded-full! lg:max-w-md" />
        <div className="skeleton h-9 w-full rounded-full! lg:ml-auto lg:w-96" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="skeleton aspect-[16/10] w-full rounded-none!" />
            <div className="space-y-2 p-4">
              <div className="skeleton h-5 w-3/4" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
