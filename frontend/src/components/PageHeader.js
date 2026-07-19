export default function PageHeader({ title, subtitle, children, testid }) {
  return (
    <div
      className="sticky top-0 z-20 bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between"
      data-testid={testid}
    >
      <div>
        <h1 className="font-head font-black text-2xl tracking-tight text-black">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
