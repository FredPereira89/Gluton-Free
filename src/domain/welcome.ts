/** The cookie that remembers a signed-in visitor dismissed the welcome card (issue #119). Not sensitive. */
export const WELCOME_DISMISSED_COOKIE = "gf_welcome_dismissed";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** The `document.cookie` assignment that records the dismissal. Browser-set, so the server can read it on the next render. */
export const welcomeDismissedCookie = () => `${WELCOME_DISMISSED_COOKIE}=1; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
