import { describe, expect, it } from "vitest";
import { matchTheForkCatalogue } from "./thefork-baseline-match";

const place = (id: number, name: string, lat: number, lng: number) => ({ id, name, lat, lng });
const page = (id: string, name: string, latitude: number, longitude: number) =>
  ({ id, name, url: `https://www.thefork.com/restaurant/x-r${id}`, latitude, longitude, thefork_review_count: 10 });

describe("matchTheForkCatalogue", () => {
  it("accepts an exact name a few metres away", () => {
    const report = matchTheForkCatalogue([place(1, "Qosqo", 38.7092, -9.1338)], [page("718428", "Qosqo", 38.70921, -9.13381)]);
    expect(report.accepted).toEqual([{ restaurantId: 1, placeRef: "718428", url: "https://www.thefork.com/restaurant/x-r718428", reviewCount: 10 }]);
  });

  it("leaves a same-name page in another part of the city unmatched", () => {
    const report = matchTheForkCatalogue([place(1, "Qosqo", 38.7092, -9.1338)], [page("1", "Qosqo", 38.75, -9.2)]);
    expect(report).toMatchObject({ accepted: [], none: [1] });
  });

  it("does not accept a similar name beyond the confident distance", () => {
    const report = matchTheForkCatalogue([place(1, "Qosqo", 38.7092, -9.1338)], [page("1", "Qosqo", 38.7107, -9.1338)]);
    expect(report.accepted).toEqual([]);
    expect(report.uncertain).toEqual([1]);
  });

  it("refuses a TheFork page claimed by two Restaurants", () => {
    const report = matchTheForkCatalogue(
      [place(1, "Sifra Sushi", 38.7092, -9.1338), place(2, "Sifra Sushi", 38.70921, -9.13381)],
      [page("9", "Sifra Sushi", 38.7092, -9.1338)],
    );
    expect(report.accepted).toEqual([]);
    expect(report.sharedPage.sort()).toEqual([1, 2]);
  });
});
