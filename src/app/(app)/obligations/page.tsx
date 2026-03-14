import { redirect } from "next/navigation";

export default function ObligationsRedirectPage() {
  redirect("/contracts?tab=obligations");
}
