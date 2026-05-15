interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  accent?: boolean;
  icon?: string;
}

export default function MetricCard({ label, value, subtitle, accent, icon }: MetricCardProps) {
  return (
    <div className="card card-hover card-glow p-6 group">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] text-muted-light font-semibold uppercase tracking-wider">{label}</span>
        {icon && (
          <span className="w-9 h-9 rounded-2xl bg-accent-soft flex items-center justify-center text-sm transition-transform duration-300 group-hover:scale-110">
            {icon}
          </span>
        )}
      </div>
      <div
        className={`text-3xl font-bold tracking-tight animate-count ${
          accent ? "text-accent" : "text-foreground"
        }`}
      >
        {value}
      </div>
      {subtitle && <p className="text-[12px] text-muted mt-2">{subtitle}</p>}
    </div>
  );
}
