import { notFound } from "next/navigation";
import { connection } from "next/server";
import { pageRole } from "@/lib/page-role";
import { DeleteMyData } from "@/web/delete-my-data";
import Link from "next/link";

export default async function AccountPage() {
  await connection();
  if (await pageRole() !== "invitee") notFound();

  return <article className="account-page">
    <h1>Your data</h1>
    <p>Delete your Invitee account, feedback and first-party usage events. This also deletes your sign-in account and signs you out.</p>
    <section aria-labelledby="delete-my-data-title">
      <h2 id="delete-my-data-title">Delete my data</h2>
      <DeleteMyData />
    </section>
    <p><Link href="/privacy">Read the privacy notice</Link></p>
  </article>;
}
