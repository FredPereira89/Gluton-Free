import { describe, expect, it } from "vitest";
import { sourceListingUrl } from "./source-link";

describe("Source Listing links", () => {
  it.each([
    ["google", "https://www.google.com/maps/search/?api=1&query_place_id=ChIJ123"],
    ["google", "https://maps.google.pt/?cid=123"],
    ["google", "https://maps.app.goo.gl/Example"],
    ["tripadvisor", "https://www.tripadvisor.co.uk/Restaurant_Review-g1-d2-Reviews-Sample.html"],
    ["thefork", "https://www.thefork.pt/restaurante/sample-r123"],
    ["critic", "https://publication.example/review/sample"],
  ])("keeps a matching %s destination", (source, url) => {
    expect(sourceListingUrl(source, url)).toBe(url);
  });

  it.each([
    ["google", "https://www.instagram.com/zedatasca_oficial/"],
    ["google", "https://feed.continente.pt/cozinha"],
    ["google", "https://www.google.com/url?q=https://example.com"],
    ["google", "https://www.google.com.evil.example/maps/place/Sample"],
    ["google", "https://evilgoogle.com/maps/place/Sample"],
    ["tripadvisor", "https://www.thefork.com/restaurant/sample-r123"],
    ["thefork", "https://www.thefork.com/login"],
    ["google", "https://account:secret@maps.google.com/?cid=123"],
    ["google", "https://maps.google.com:8443/?cid=123"],
    ["critic", "javascript:alert(1)"],
    ["critic", "not a URL"],
    ["google", null],
  ])("omits an invalid or misattributed %s destination", (source, url) => {
    expect(sourceListingUrl(source!, url)).toBeNull();
  });
});
