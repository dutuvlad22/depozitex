import CourierSettingsForm from "@/components/courier-settings-form";
import { requireOrgContext } from "@/lib/org-context";

export default async function SetariCurierPage() {
  const { isAdmin } = await requireOrgContext();

  if (!isAdmin) {
    return (
      <div className="stack">
        <div className="hint">Doar administratorii pot vedea aceasta pagina.</div>
      </div>
    );
  }

  return <CourierSettingsForm />;
}
