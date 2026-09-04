import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import LocationsManager, { type LocationRow } from "@/components/locations-manager";
import { requireOrgContext } from "@/lib/org-context";

export default async function DepozitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizationId, isAdmin } = await requireOrgContext();

  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id, name, city")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!warehouse) {
    notFound();
  }

  const { data: locations } = await supabase
    .from("locations")
    .select("id, code, zone, created_at")
    .eq("warehouse_id", warehouse.id)
    .order("code", { ascending: true });

  return (
    <div className="stack">
      <Link href="/depozite" className="back-link">
        <ArrowLeft size={14} /> Depozite
      </Link>
      <div className="page-heading">
        <h2>{warehouse.name}</h2>
        {warehouse.city && <span className="muted">{warehouse.city}</span>}
      </div>
      <LocationsManager
        organizationId={organizationId}
        warehouseId={warehouse.id}
        initialLocations={(locations ?? []) as LocationRow[]}
        isAdmin={isAdmin}
      />
    </div>
  );
}
