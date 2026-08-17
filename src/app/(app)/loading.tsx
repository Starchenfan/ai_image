export default function AppLoading() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-10 w-64 rounded-lg" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-48 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
