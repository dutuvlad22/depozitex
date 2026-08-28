import type { LucideIcon } from "lucide-react";

export default function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <Icon size={28} strokeWidth={1.75} />
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
