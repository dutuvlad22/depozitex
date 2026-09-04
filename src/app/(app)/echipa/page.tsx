import TeamManager, { type InviteRow, type MemberRow } from "@/components/team-manager";
import { requireOrgContext } from "@/lib/org-context";

export default async function EchipaPage() {
  const { supabase, user, organizationId, isAdmin } = await requireOrgContext();

  const membersQuery = supabase
    .from("memberships")
    .select("id, user_id, role, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  const invitesQuery = isAdmin
    ? supabase
        .from("invites")
        .select("id, code, role, created_at, expires_at, used_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
    : Promise.resolve({ data: [] as InviteRow[] });

  const [{ data: members }, { data: invites }] = await Promise.all([
    membersQuery,
    invitesQuery,
  ]);

  // memberships.user_id si profiles.id nu au FK direct intre ele (ambele
  // trimit spre auth.users), asa ca PostgREST nu poate face embed automat
  // — le combinam manual dupa doua interogari.
  const userIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } =
    userIds.length > 0
      ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const membersWithProfiles: MemberRow[] = (members ?? []).map((m) => ({
    ...m,
    profiles: profileById.get(m.user_id)
      ? {
          full_name: profileById.get(m.user_id)!.full_name,
          email: profileById.get(m.user_id)!.email,
        }
      : null,
  }));

  return (
    <TeamManager
      organizationId={organizationId}
      currentUserId={user.id}
      isAdmin={isAdmin}
      initialMembers={membersWithProfiles}
      initialInvites={(invites ?? []) as InviteRow[]}
    />
  );
}
