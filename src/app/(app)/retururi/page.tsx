import { RotateCcw } from "lucide-react";
import EmptyState from "@/components/empty-state";

export default function RetururiPage() {
  return (
    <div className="stack">
      <EmptyState
        icon={RotateCcw}
        title="Retururi"
        description="Inregistrarea retururilor si deciziile de restock / defect vor fi adaugate aici."
      />
    </div>
  );
}
