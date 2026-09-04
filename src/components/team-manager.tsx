"use client";

import { useState } from "react";
import { Check, Copy, Ticket, Trash2, UserCog } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
};

export type InviteRow = {
  id: string;
  code: string;
  role: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
};

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "operator", label: "Angajat" },
  { value: "viewer", label: "Vizualizare" },
  { value: "owner", label: "Owner" },
];
const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  operator: "Angajat",
  viewer: "Vizualizare",
};

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function TeamManager({
  organizationId,
  currentUserId,
  isAdmin,
  initialMembers,
  initialInvites,
}: {
  organizationId: string;
  currentUserId: string;
  isAdmin: boolean;
  initialMembers: MemberRow[];
  initialInvites: InviteRow[];
}) {
  const [members, setMembers] = useState<MemberRow[]>(initialMembers);
  const [invites, setInvites] = useState<InviteRow[]>(initialInvites);
  const [inviteRole, setInviteRole] = useState("operator");
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  async function handleGenerateInvite() {
    setError(null);
    setGenerating(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("invites")
      .insert({
        organization_id: organizationId,
        code: generateCode(),
        role: inviteRole,
        created_by: currentUserId,
      })
      .select("id, code, role, created_at, expires_at, used_at")
      .single();

    setGenerating(false);

    if (error) {
      setError(error.message);
      return;
    }

    setInvites((prev) => [data as InviteRow, ...prev]);
  }

  async function handleCopy(code: string, id: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // clipboard indisponibil — codul e oricum vizibil pe ecran
    }
  }

  async function handleRevokeInvite(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("invites").delete().eq("id", id);
    if (!error) {
      setInvites((prev) => prev.filter((i) => i.id !== id));
    }
  }

  async function handleRoleChange(member: MemberRow, role: string) {
    setError(null);
    setSavingMemberId(member.id);

    const supabase = createClient();
    const { error } = await supabase.from("memberships").update({ role }).eq("id", member.id);

    setSavingMemberId(null);

    if (error) {
      setError(error.message);
      return;
    }

    setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role } : m)));
  }

  async function handleRemoveMember(member: MemberRow) {
    setError(null);
    setSavingMemberId(member.id);

    const supabase = createClient();
    const { error } = await supabase.from("memberships").delete().eq("id", member.id);

    setSavingMemberId(null);
    setConfirmRemoveId(null);

    if (error) {
      setError(error.message);
      return;
    }

    setMembers((prev) => prev.filter((m) => m.id !== member.id));
  }

  return (
    <div className="stack">
      {isAdmin && (
        <div className="panel">
          <div className="panel-head">
            <Ticket size={16} /> Genereaza cod de invitatie
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="inviteRole">Rol pentru cel invitat</label>
              <select
                id="inviteRole"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn primary"
              type="button"
              onClick={handleGenerateInvite}
              disabled={generating}
            >
              {generating ? "Se genereaza..." : "Genereaza cod"}
            </button>
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            Trimite codul persoanei invitate. Ea se inregistreaza normal (email + parola), apoi
            introduce codul la primul login ca sa se alature organizatiei tale, cu rolul ales mai
            sus. Codul expira in 7 zile sau la prima folosire.
          </p>
          {error && <div className="auth-msg err">{error}</div>}

          {invites.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Cod</th>
                    <th>Rol</th>
                    <th>Status</th>
                    <th>Expira</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((inv) => {
                    const expired = !inv.used_at && new Date(inv.expires_at) < new Date();
                    const status = inv.used_at ? "Folosit" : expired ? "Expirat" : "Activ";
                    return (
                      <tr key={inv.id}>
                        <td className="mono strong">
                          <span className="loc">{inv.code}</span>
                        </td>
                        <td className="muted">{ROLE_LABEL[inv.role] ?? inv.role}</td>
                        <td>
                          <span className={`pill ${status === "Activ" ? "ok" : status === "Expirat" ? "red" : ""}`}>
                            {status}
                          </span>
                        </td>
                        <td className="muted small">
                          {new Date(inv.expires_at).toLocaleDateString("ro-RO")}
                        </td>
                        <td className="actions">
                          {status === "Activ" && (
                            <>
                              <button
                                className="icon-btn"
                                onClick={() => handleCopy(inv.code, inv.id)}
                                title="Copiaza codul"
                              >
                                {copiedId === inv.id ? <Check size={15} /> : <Copy size={15} />}
                              </button>
                              <button
                                className="icon-btn"
                                onClick={() => handleRevokeInvite(inv.id)}
                                title="Revoca invitatia"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <UserCog size={16} /> Membrii echipei
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nume / Email</th>
                <th>Rol</th>
                <th>Alaturat</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.user_id === currentUserId;
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="strong">{m.profiles?.full_name || "—"}</div>
                      <div className="muted small">{m.profiles?.email ?? "—"}</div>
                    </td>
                    <td>
                      {isAdmin && !isSelf ? (
                        <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m, e.target.value)}
                          disabled={savingMemberId === m.id}
                          style={{ minWidth: 130 }}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="pill ok">{ROLE_LABEL[m.role] ?? m.role}</span>
                      )}
                    </td>
                    <td className="muted small">
                      {new Date(m.created_at).toLocaleDateString("ro-RO")}
                    </td>
                    {isAdmin && (
                      <td className="actions">
                        {isSelf ? (
                          <span className="muted small">tu</span>
                        ) : confirmRemoveId === m.id ? (
                          <span className="confirm-delete">
                            <span className="small muted">Sigur?</span>
                            <button
                              className="btn small ghost"
                              onClick={() => setConfirmRemoveId(null)}
                              disabled={savingMemberId === m.id}
                            >
                              Nu
                            </button>
                            <button
                              className="btn small danger"
                              onClick={() => handleRemoveMember(m)}
                              disabled={savingMemberId === m.id}
                            >
                              {savingMemberId === m.id ? "..." : "Da, elimina"}
                            </button>
                          </span>
                        ) : (
                          <button
                            className="icon-btn"
                            onClick={() => setConfirmRemoveId(m.id)}
                            title="Elimina din organizatie"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
