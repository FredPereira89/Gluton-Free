---
status: accepted
---

# Every Restaurant is judged on a capped, recent Review window, not its full history

Extracting a text Review costs about $0.36 per 1,000 by batch, and the Lisbon baseline has about 590 Restaurants. Analysing every Review each one has ever received would cost several times the budget, and fetching is cheap next to extraction. We therefore judge every Restaurant, Peer or looked-up, on the same **Review window**, set per Crowd Source:

- Take that Source's text Reviews newest first, up to **C = 100** and no older than **L = 24 months**.
- The Source's window runs from its oldest included text Review to today. Its stars input uses every rating dated inside that window, including rating-only Reviews, so stars and text describe the same period.
- Aspects pool the windows of all Sources; there are still no Source weights.
- A Source with fewer than 10 text Reviews in its window still counts, but is left out of the per-Source Confidence cap.
- Windows roll forward at each monthly refresh. Reviews that fall out of a window stay stored but stop counting.

With an 18-month half-life, Reviews older than 24 months carried little weight anyway. Up to about 200 pooled text Reviews is enough for the exceptional-language test, which needs 36–180. Decided in [Lisbon Peer snapshot and Review depth policy](https://github.com/FredPereira89/Gluton-Free/issues/13).

## Consequences

- A Restaurant and its Peers get comparable n_eff, shrinkage and consistency, because none has more history than the others.
- O Velho Eurico's full-history extraction is not needed.
- The Verdict page's quarterly chart covers only the window. Anything older belongs to [Review recency, Restaurant changes, and trends](https://github.com/FredPereira89/Gluton-Free/issues/16).
- Changing C, L or the extractor after the baseline means paying to extract every Peer again. The baseline therefore waits for the extractor to be frozen on O Velho Eurico.

## Considered Options

- **Full history for every Restaurant:** most information, but several times the budget, and old Reviews barely count under the 18-month half-life.
- **Full history for looked-up Restaurants only:** they would be judged on different terms from their Peers.
- **Newest N text Reviews pooled across Sources:** the busiest Source crowds the others out (at O Velho Eurico, 378 of the newest 400 were from Google).
