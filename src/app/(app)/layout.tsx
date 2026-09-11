import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import OnboardingScreen from "@/components/onboarding-screen";
import { createClient } from "@/lib/supabase/server";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware deja redirectioneaza userii nelogati catre /login;
  // verificarea de aici e o plasa de siguranta suplimentara.
  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  // Userul nu are inca nicio organizatie -> ii cerem sa creeze una
  // sau sa se alature cu un cod de invitatie, in loc sa randam
  // aplicatia (fara organizatie nu e ce afisa).
  if (!membership) {
    return <OnboardingScreen />;
  }

  const role = membership.role as string;
  const isAdmin = role === "owner" || role === "admin";

  return (
    <AppShell email={user.email ?? ""} role={role} isAdmin={isAdmin}>
      {children}
    </AppShell>
  );
}
