import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
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

  return <AppShell email={user.email ?? ""}>{children}</AppShell>;
}
