/** Sources a Listing can come from, as the owner API and Owner questions name them. */
export const LISTING_SOURCES = ["google", "tripadvisor", "thefork"] as const;
export type ListingSource = typeof LISTING_SOURCES[number];
