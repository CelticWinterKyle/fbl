export default function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="card-header">{title}</div>
      <div className="card-body">{children}</div>
    </section>
  );
}
