export default function LoadingEditor() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading the editor">
      <div className="skeleton h-7 w-24" />
      <div className="space-y-2">
        <div className="skeleton h-6 w-40" />
        <div className="skeleton h-9 w-3/4 max-w-xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[290px_minmax(0,1fr)_380px]">
        <div className="hidden xl:block card h-[420px] p-5 space-y-3">
          <div className="skeleton h-4 w-20" />
          <div className="skeleton h-5 w-3/4" />
          <div className="skeleton h-24 w-full" />
        </div>
        <div className="card h-[460px] p-6 space-y-3">
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
          <div className="skeleton h-4 w-3/4" />
        </div>
        <div className="card h-[300px] p-5 space-y-3">
          <div className="skeleton size-14 rounded-full" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}
