import TeamManager, { type InviteRow, type MemberRow } from "@/components/team-manager";
import { requireOrgContext } from "@/lib/org-context";

export default async function EchipaPage() {
  const { supabase, user, organizationId, isAdmin } = await requireOrgContext();

  const membersQuery = supabase
    .from("memberships")
    .select("id, user_id, role, created_at, profiles(full_name, email)")
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

  return (
    <TeamManager
      organizationId={organizationId}
      currentUserId={user.id}
      isAdmin={isAdmin}
      initialMembers={(members ?? []) as unknown as MemberRow[]}
      initialInvites={(invites ?? []) as InviteRow[]}
    />
  );
}
