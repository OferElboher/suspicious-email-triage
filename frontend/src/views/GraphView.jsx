/**
 * Phishing graph tab — shows one Neo4j campaign at a time (not the full database).
 * Pattern: fetch sorted campaigns, then lazy-load /graph/campaign-subgraph per selection.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { getJson } from "../api/client";
import CampaignGraphCanvas from "../components/CampaignGraphCanvas";
import { clampZoom, findCampaignIndexForDate, sortCampaignsBySize, ZOOM_STEP } from "../lib/graphLayout";

/** Empty subgraph placeholder before fetch completes. */
const EMPTY_GRAPH = { nodes: [], edges: [], indicator: "", reviewCount: 0 };

export default function GraphView() {
  const [campaigns, setCampaigns] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [subgraph, setSubgraph] = useState(EMPTY_GRAPH);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [subgraphLoading, setSubgraphLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewEpoch, setViewEpoch] = useState(0);
  const [jumpDate, setJumpDate] = useState("");
  const [jumpMessage, setJumpMessage] = useState("");

  const sortedCampaigns = useMemo(() => sortCampaignsBySize(campaigns), [campaigns]);
  const selectedCampaign = sortedCampaigns[selectedIndex] || null;

  /** Load campaign list (ordered by reviewCount desc on the server). */
  const refreshCampaigns = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getJson("/graph/campaigns");
      const list = sortCampaignsBySize(data.campaigns || []);
      setCampaigns(list);
      setSelectedIndex(0);
      setZoom(1);
    } catch (err) {
      setError(err.message || "Failed to load campaigns");
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Fetch subgraph only for the active campaign indicator. */
  const loadSubgraph = useCallback(async (indicator) => {
    if (!indicator) {
      setSubgraph(EMPTY_GRAPH);
      return;
    }
    setSubgraphLoading(true);
    try {
      const encoded = encodeURIComponent(indicator);
      const data = await getJson(`/graph/campaign-subgraph?indicator=${encoded}`);
      setSubgraph(data);
      setError("");
    } catch (err) {
      setSubgraph(EMPTY_GRAPH);
      setError(err.message || "Failed to load campaign graph");
    } finally {
      setSubgraphLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCampaigns().catch(() => {});
  }, [refreshCampaigns]);

  useEffect(() => {
    if (selectedCampaign?.indicator) {
      loadSubgraph(selectedCampaign.indicator).catch(() => {});
    } else {
      setSubgraph(EMPTY_GRAPH);
    }
  }, [selectedCampaign?.indicator, loadSubgraph]);

  const goFirst = () => {
    setSelectedIndex(0);
    setZoom(1);
    setViewEpoch((n) => n + 1);
  };

  const goLast = () => {
    setSelectedIndex(Math.max(0, sortedCampaigns.length - 1));
    setZoom(1);
    setViewEpoch((n) => n + 1);
  };

  const goPrev = () => {
    setSelectedIndex((i) => Math.max(0, i - 1));
    setZoom(1);
    setViewEpoch((n) => n + 1);
  };

  const goNext = () => {
    setSelectedIndex((i) => Math.min(sortedCampaigns.length - 1, i + 1));
    setZoom(1);
    setViewEpoch((n) => n + 1);
  };

  const zoomIn = () => setZoom((z) => clampZoom(z + ZOOM_STEP));
  const zoomOut = () => setZoom((z) => clampZoom(z - ZOOM_STEP));
  const resetView = () => {
    setZoom(1);
    setViewEpoch((n) => n + 1);
  };

  /** Jump to the first campaign whose Neo4j updatedAt matches the picked calendar day. */
  const jumpToCampaignDate = () => {
    setJumpMessage("");
    const idx = findCampaignIndexForDate(sortedCampaigns, jumpDate);
    if (idx == null) {
      setJumpMessage(`No campaign found for ${jumpDate || "that date"}.`);
      return;
    }
    setSelectedIndex(idx);
    setZoom(1);
    setViewEpoch((n) => n + 1);
    setJumpMessage(`Showing campaign ${idx + 1} (${sortedCampaigns[idx]?.indicator}).`);
  };

  const hasCampaigns = sortedCampaigns.length > 0;

  return (
    <div className="graph-layout graph-layout--campaign">
      <section className="card">
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>Detected campaigns (shared indicators)</h2>
          <button type="button" onClick={() => refreshCampaigns().catch(() => {})}>
            Refresh
          </button>
        </div>
        <p className="muted">
          A <strong>campaign</strong> groups two or more risky reviews that reuse the same phishing
          domain (Neo4j <code>Campaign</code> node). The relationship graph appears only when at
          least one campaign exists — one campaign per view, largest clusters first.
        </p>
        {loading && <p className="muted">Loading campaigns…</p>}
        {error && <p className="status-failed">{error}</p>}
        {!loading && !hasCampaigns && !error && (
          <p className="muted">No campaigns detected yet.</p>
        )}
        {hasCampaigns && (
          <ul className="dashboard-list">
            {sortedCampaigns.map((c, idx) => (
              <li key={c.indicator}>
                <button
                  type="button"
                  className={`review-row-toggle${idx === selectedIndex ? " active-campaign" : ""}`}
                  onClick={() => {
                    setSelectedIndex(idx);
                    setZoom(1);
                  }}
                >
                  <strong>{c.indicator}</strong>
                  <div className="muted">
                    {c.kind || "shared_domain"} · {c.reviewCount} linked review(s)
                    {idx === selectedIndex ? " · viewing" : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {hasCampaigns && (
        <section className="card">
          <div className="toolbar graph-toolbar">
            <h2 style={{ margin: 0 }}>Phishing relationship graph</h2>
            <div className="graph-controls">
              <button type="button" disabled={selectedIndex === 0} onClick={goFirst}>
                ⏮ First
              </button>
              <button type="button" disabled={selectedIndex === 0} onClick={goPrev}>
                ◀ Prev
              </button>
              <span className="muted">
                {selectedIndex + 1} / {sortedCampaigns.length}: {selectedCampaign?.indicator}
              </span>
              <button
                type="button"
                disabled={selectedIndex >= sortedCampaigns.length - 1}
                onClick={goNext}
              >
                Next ▶
              </button>
              <button
                type="button"
                disabled={selectedIndex >= sortedCampaigns.length - 1}
                onClick={goLast}
              >
                Last ⏭
              </button>
              <button type="button" onClick={zoomOut} aria-label="Zoom out">
                Zoom −
              </button>
              <button type="button" onClick={zoomIn} aria-label="Zoom in">
                Zoom +
              </button>
              <button type="button" onClick={resetView}>
                Reset view
              </button>
              <label className="field field--inline-date">
                Jump to date
                <input
                  type="date"
                  value={jumpDate}
                  onChange={(e) => setJumpDate(e.target.value)}
                />
              </label>
              <button type="button" disabled={!jumpDate} onClick={jumpToCampaignDate}>
                Go
              </button>
            </div>
          </div>
          {jumpMessage && <p className="muted">{jumpMessage}</p>}
          <p className="muted">
            Drag the graph to pan; drag the bottom edge to resize. Hover nodes or edges for details.
            Neo4j subgraph via <code>GET /graph/campaign-subgraph</code>, SVG rendering (no D3).
          </p>
          {subgraphLoading && <p className="muted">Loading campaign graph…</p>}
          {!subgraphLoading && subgraph.nodes.length === 0 && (
            <p className="muted">No graph nodes for this campaign yet — try Refresh after reviews complete.</p>
          )}
          {!subgraphLoading && subgraph.nodes.length > 0 && (
            <CampaignGraphCanvas
              key={`${selectedCampaign?.indicator}-${viewEpoch}`}
              graph={subgraph}
              zoom={zoom}
            />
          )}
        </section>
      )}
    </div>
  );
}
