export default function LoadingNewPost() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your stories">
      <div className="space-y-2 pb-2">
        <div className="skeleton h-4 w-20" />
        <div className="skeleton h-10 w-80 max-w-full" />
        <div className="skeleton h-5 w-full max-w-xl" />
      </div>
      <div className="skeleton h-10 w-full rounded-[12px]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="card overflow-hidden">
            <div className="skeleton aspect-[16/10] w-full !rounded-none" />
            <div className="space-y-2 p-4">
              <div className="skeleton h-5 w-3/4" />
              <div className="skeleton h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
