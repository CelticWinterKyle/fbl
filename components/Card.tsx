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
    <section className={`rounded-xl border border-gray-800 bg-gray-900 p-4 shadow ${className}`}>
      <div className="mb-3 flex items-center gap-3">
        {title ? <h2 className="text-base font-semibold tracking-tight">{title}</h2> : null}
        {subtitle ? <span className="text-xs text-gray-400">{subtitle}</span> : null}
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  );
}
