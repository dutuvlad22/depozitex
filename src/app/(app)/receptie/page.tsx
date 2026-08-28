import { PackagePlus } from "lucide-react";
import EmptyState from "@/components/empty-state";

export default function ReceptiePage() {
  return (
    <div className="stack">
      <EmptyState
        icon={PackagePlus}
        title="Receptie"
        description="Fluxul de receptie marfa (client, linii, locatii de raft) va fi adaugat aici."
      />
    </div>
  );
}
