import { LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { signOut } from "@/app/console/[locale]/actions";
import { Button } from "@/components/ui/button";

export async function SignOutButton() {
  const t = await getTranslations("console");
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
        <LogOut className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        {t("signOut")}
      </Button>
    </form>
  );
}
