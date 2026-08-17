export default function HistoryLoading() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-10 w-48 rounded-lg" />
      <div className="skeleton h-9 w-full max-w-md rounded-md" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
