export default function LoadingStudio() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the Studio">
      <div className="space-y-2 pb-2">
        <div className="skeleton h-4 w-16" />
        <div className="skeleton h-10 w-64" />
        <div className="skeleton h-5 w-full max-w-xl" />
      </div>
      <div className="skeleton h-9 w-80 rounded-full" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((c) => (
          <div key={c} className="space-y-2.5">
            <div className="skeleton h-5 w-24" />
            {[0, 1].map((i) => (
              <div key={i} className="card flex gap-3 p-3">
                <div className="skeleton h-[70px] w-14 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-full" />
                  <div className="skeleton h-4 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
