import { Boxes } from "lucide-react";
import EmptyState from "@/components/empty-state";

export default function StocPage() {
  return (
    <div className="stack">
      <EmptyState
        icon={Boxes}
        title="Stoc"
        description="Tabelul de stoc pe SKU, locatii si praguri de reaprovizionare va fi adaugat aici."
      />
    </div>
  );
}
