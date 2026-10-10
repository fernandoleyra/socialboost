export default function Loading() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]" aria-busy="true" aria-label="Loading interview">
      <div className="space-y-4">
        <div className="skeleton h-5 w-28" />
        <div className="skeleton h-9 w-2/3" />
        <div className="space-y-3 pt-4">
          <div className="skeleton h-14 w-3/4 rounded-[20px]" />
          <div className="ml-auto skeleton h-20 w-2/3 rounded-[20px]" />
          <div className="skeleton h-12 w-1/2 rounded-[20px]" />
        </div>
      </div>
      <div className="hidden lg:block">
        <div className="skeleton h-96 rounded-panel" />
      </div>
    </div>
  );
}
