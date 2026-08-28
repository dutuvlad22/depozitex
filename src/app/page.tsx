import { LayoutDashboard } from "lucide-react";
import EmptyState from "@/components/empty-state";

export default function PanouPage() {
  return (
    <div className="stack">
      <EmptyState
        icon={LayoutDashboard}
        title="Panou"
        description="KPI-uri si activitate recenta vor aparea aici dupa conectarea la Supabase."
      />
    </div>
  );
}
