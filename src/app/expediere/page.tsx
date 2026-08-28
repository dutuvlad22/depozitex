import { Truck } from "lucide-react";
import EmptyState from "@/components/empty-state";

export default function ExpedierePage() {
  return (
    <div className="stack">
      <EmptyState
        icon={Truck}
        title="Expediere"
        description="Generarea AWB-urilor si lista expedierilor prin curieri va fi adaugata aici."
      />
    </div>
  );
}
