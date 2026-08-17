export default function AdminLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="skeleton h-9 w-48 rounded-lg" />
        <div className="skeleton h-9 w-24 rounded-md" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-44 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
