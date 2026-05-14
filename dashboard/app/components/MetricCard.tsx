interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  accent?: boolean;
  icon?: string;
}

export default function MetricCard({ label, value, subtitle, accent, icon }: MetricCardProps) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-light font-medium uppercase tracking-wider">{label}</span>
        {icon && <span className="text-lg opacity-50">{icon}</span>}
      </div>
      <div
        className={`text-3xl font-semibold tracking-tight animate-count ${
          accent ? "text-accent" : "text-foreground"
        }`}
      >
        {value}
      </div>
      {subtitle && <p className="text-xs text-muted-light mt-2">{subtitle}</p>}
    </div>
  );
}
