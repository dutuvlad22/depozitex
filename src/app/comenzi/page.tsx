import { ClipboardList } from "lucide-react";
import EmptyState from "@/components/empty-state";

export default function ComenziPage() {
  return (
    <div className="stack">
      <EmptyState
        icon={ClipboardList}
        title="Comenzi"
        description="Panoul kanban cu comenzile (nou, de pregatit, ambalat, expediat) va fi adaugat aici."
      />
    </div>
  );
}
