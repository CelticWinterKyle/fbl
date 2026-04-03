export default function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string | React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-pitch-700 bg-pitch-900 p-4 shadow-lg shadow-black/40 ${className}`}>
      <div className="mb-3 flex items-center gap-3">
        {title ? (
          <h2 className="text-sm font-bold tracking-[0.12em] uppercase text-gray-300">{title}</h2>
        ) : null}
        {subtitle ? <span className="text-xs text-gray-500">{subtitle}</span> : null}
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  );
}
