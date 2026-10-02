/** The ementa's nameplate: a solid blue band with the menu's name and its dateline, set like the head of a printed menu. */
export function Masthead() {
  const issue = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Europe/Lisbon" }).format(new Date());
  return <p className="masthead">
    <span className="masthead-side">Lisbon</span>
    <span className="masthead-name">Ementa do Dia</span>
    <span className="masthead-side">{issue}</span>
  </p>;
}
