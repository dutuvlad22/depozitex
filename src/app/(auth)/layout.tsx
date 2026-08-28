import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AuthGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Userul deja logat nu are ce cauta pe /login sau /register.
  if (user) {
    redirect("/");
  }

  return <div className="auth-page">{children}</div>;
}
