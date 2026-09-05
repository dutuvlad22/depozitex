import { notFound } from "next/navigation";
import ReceiptScanner, { type ReceiptLineRow } from "@/components/receipt-scanner";
import { requireOrgContext } from "@/lib/org-context";

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizationId } = await requireOrgContext();

  const { data: receipt } = await supabase
    .from("receipts")
    .select("id, reference, status, created_at, clients(name), warehouses(name)")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!receipt) {
    notFound();
  }

  const { data: lines } = await supabase
    .from("receipt_lines")
    .select("id, quantity, received_quantity, products(sku, name), locations(code)")
    .eq("receipt_id", id)
    .order("id", { ascending: true });

  return (
    <ReceiptScanner
      receiptId={receipt.id}
      status={receipt.status}
      reference={receipt.reference}
      createdAt={receipt.created_at}
      clientName={(receipt.clients as unknown as { name: string } | null)?.name ?? "—"}
      warehouseName={(receipt.warehouses as unknown as { name: string } | null)?.name ?? "—"}
      initialLines={(lines ?? []) as unknown as ReceiptLineRow[]}
    />
  );
}
