import { connection } from "next/server";
import { ActivityList } from "@/web/activity-list";
import { loadActivity } from "@/web/data";
import SearchHome from "./search-home";

export default async function HomePage() {
  await connection();
  const activity = await loadActivity();
  return (
    <>
      <ActivityList activity={activity} />
      <SearchHome />
    </>
  );
}
