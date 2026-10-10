export default function CalendarLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the calendar">
      <div className="space-y-2 pb-6">
        <div className="skeleton h-10 w-48" />
        <div className="skeleton h-5 w-80 max-w-full" />
      </div>
      <div className="flex items-center justify-between">
        <div className="skeleton h-8 w-44" />
        <div className="skeleton h-8 w-40" />
      </div>
      <div className="card grid grid-cols-7 gap-px overflow-hidden p-0">
        {Array.from({ length: 35 }, (_, i) => (
          <div key={i} className="h-14 p-1.5 sm:h-[124px]">
            <div className="skeleton ml-auto size-6 rounded-full" />
            {i % 3 === 1 && <div className="skeleton mt-2 hidden h-5 sm:block" />}
          </div>
        ))}
      </div>
    </div>
  );
}
