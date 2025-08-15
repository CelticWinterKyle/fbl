import { LeagueData } from "@/lib/types";
import { format } from "date-fns";

export default function NewsFeed({ data }: { data: LeagueData }) {
  return (
    <ul className="space-y-3">
      {data.news.map(n => (
        <li key={n.id} className="card">
          <div className="card-header text-sm">{format(new Date(n.date), "PPP")}</div>
          <div className="card-body">
            <div className="font-semibold">{n.title}</div>
            <p className="text-sm text-gray-700">{n.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
