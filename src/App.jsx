import { useCallback, useMemo, useRef, useState } from "react";
import "./App.css";

// ─── Constantes ──────────────────────────────────────────────────────────────
const CHANNELS = [1, 6, 11];
const CHANNEL_COLORS = { 1: "#00e5ff", 6: "#69ff47", 11: "#ff6b35" };
const CHANNEL_LABELS = { 1: "CH 1", 6: "CH 6", 11: "CH 11" };

const INITIAL_APS = [
  { id: 1, name: "AP-01", x: 150, y: 140, channel: 1 },
  { id: 2, name: "AP-02", x: 370, y: 110, channel: 1 },
  { id: 3, name: "AP-03", x: 560, y: 230, channel: 6 },
  { id: 4, name: "AP-04", x: 270, y: 320, channel: 6 },
  { id: 5, name: "AP-05", x: 490, y: 420, channel: 1 },
];

const INITIAL_LINKS = [
  [1, 2],
  [2, 3],
  [3, 5],
  [1, 4],
  [4, 5],
  [2, 4],
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function normalizeLink(a, b) {
  return a < b ? [a, b] : [b, a];
}

function sameLink(link, a, b) {
  const [x, y] = normalizeLink(a, b);
  return link[0] === x && link[1] === y;
}

function countConflicts(aps, links) {
  let n = 0;
  for (const [a, b] of links) {
    const apA = aps.find((ap) => ap.id === a);
    const apB = aps.find((ap) => ap.id === b);
    if (apA && apB && apA.channel === apB.channel) n++;
  }
  return n;
}

function getConflictedAPIds(aps, links) {
  const set = new Set();
  for (const [a, b] of links) {
    const apA = aps.find((ap) => ap.id === a);
    const apB = aps.find((ap) => ap.id === b);
    if (apA && apB && apA.channel === apB.channel) {
      set.add(a);
      set.add(b);
    }
  }
  return Array.from(set);
}

function conflictScoreForChannel(apId, channel, aps, links) {
  let score = 0;
  for (const [a, b] of links) {
    if (a !== apId && b !== apId) continue;
    const neighborId = a === apId ? b : a;
    const neighbor = aps.find((ap) => ap.id === neighborId);
    if (neighbor && neighbor.channel === channel) score++;
  }
  return score;
}

function runMinConflicts(aps, links, maxIterations = 1000) {
  let current = aps.map((ap) => ({ ...ap }));
  const before = countConflicts(current, links);
  const history = [];

  for (let iter = 1; iter <= maxIterations; iter++) {
    const total = countConflicts(current, links);
    if (total === 0) {
      return { solution: current, before, after: 0, iterations: iter - 1, success: true, history };
    }

    const conflictedIds = getConflictedAPIds(current, links);
    if (conflictedIds.length === 0) break;

    const selectedId = conflictedIds[Math.floor(Math.random() * conflictedIds.length)];

    let bestChannels = [];
    let bestScore = Infinity;

    for (const ch of CHANNELS) {
      const score = conflictScoreForChannel(selectedId, ch, current, links);
      if (score < bestScore) {
        bestScore = score;
        bestChannels = [ch];
      } else if (score === bestScore) {
        bestChannels.push(ch);
      }
    }

    const chosen = bestChannels[Math.floor(Math.random() * bestChannels.length)];
    current = current.map((ap) => (ap.id === selectedId ? { ...ap, channel: chosen } : ap));

    history.push({
      iteration: iter,
      apId: selectedId,
      apName: current.find((ap) => ap.id === selectedId)?.name,
      channel: chosen,
      conflicts: countConflicts(current, links),
    });
  }

  return {
    solution: current,
    before,
    after: countConflicts(current, links),
    iterations: maxIterations,
    success: countConflicts(current, links) === 0,
    history,
  };
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function App() {
  const canvasRef = useRef(null);

  const [aps, setAps] = useState(INITIAL_APS);
  const [links, setLinks] = useState(INITIAL_LINKS);
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [linkMode, setLinkMode] = useState(false);
  const [selectedAP, setSelectedAP] = useState(null);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState("aps"); // aps | result | info

  const conflicts = useMemo(() => countConflicts(aps, links), [aps, links]);

  // ── Position souris ──
  function getPos(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  // ── Ajouter AP ──
  function handleAddAP() {
    const nextId = aps.length > 0 ? Math.max(...aps.map((ap) => ap.id)) + 1 : 1;
    setAps((prev) => [
      ...prev,
      {
        id: nextId,
        name: `AP-${String(nextId).padStart(2, "0")}`,
        x: 100 + Math.random() * 500,
        y: 80 + Math.random() * 380,
        channel: CHANNELS[Math.floor(Math.random() * CHANNELS.length)],
      },
    ]);
    setResult(null);
  }

  // ── Double-clic sur canvas ──
  function handleDoubleClick(event) {
    if (event.target !== canvasRef.current && !event.target.classList.contains("canvas-inner")) return;
    const pos = getPos(event);
    const nextId = aps.length > 0 ? Math.max(...aps.map((ap) => ap.id)) + 1 : 1;
    setAps((prev) => [
      ...prev,
      {
        id: nextId,
        name: `AP-${String(nextId).padStart(2, "0")}`,
        x: pos.x,
        y: pos.y,
        channel: CHANNELS[Math.floor(Math.random() * CHANNELS.length)],
      },
    ]);
    setResult(null);
  }

  // ── Supprimer AP ──
  function handleDeleteAP(id) {
    setAps((prev) => prev.filter((ap) => ap.id !== id));
    setLinks((prev) => prev.filter(([a, b]) => a !== id && b !== id));
    setSelectedAP(null);
    setResult(null);
  }

  // ── Drag ──
  function handleAPMouseDown(event, ap) {
    event.stopPropagation();
    if (linkMode) {
      handleSelectForLink(ap.id);
      return;
    }
    const pos = getPos(event);
    setDragging(ap.id);
    setDragOffset({ x: pos.x - ap.x, y: pos.y - ap.y });
  }

  const handleMouseMove = useCallback(
    (event) => {
      if (!dragging) return;
      const pos = getPos(event);
      setAps((prev) =>
        prev.map((ap) =>
          ap.id === dragging
            ? {
                ...ap,
                x: Math.max(46, Math.min(pos.x - dragOffset.x, 754)),
                y: Math.max(46, Math.min(pos.y - dragOffset.y, 514)),
              }
            : ap
        )
      );
    },
    [dragging, dragOffset]
  );

  function handleMouseUp() {
    setDragging(null);
  }

  // ── Liaison ──
  function handleSelectForLink(apId) {
    if (!selectedAP) { setSelectedAP(apId); return; }
    if (selectedAP === apId) { setSelectedAP(null); return; }
    const [a, b] = normalizeLink(selectedAP, apId);
    setLinks((prev) => {
      const exists = prev.some((link) => sameLink(link, a, b));
      return exists ? prev.filter((link) => !sameLink(link, a, b)) : [...prev, [a, b]];
    });
    setSelectedAP(null);
    setResult(null);
  }

  // ── Canal manuel ──
  function handleChannelChange(apId, channel) {
    setAps((prev) => prev.map((ap) => (ap.id === apId ? { ...ap, channel: Number(channel) } : ap)));
    setResult(null);
  }

  // ── Lancer Min-Conflicts ──
  function handleRun() {
    setRunning(true);
    setResult(null);
    setTimeout(() => {
      const res = runMinConflicts(aps, links, 1000);
      setAps(res.solution);
      setResult(res);
      setRunning(false);
      setActiveTab("result");
    }, 400);
  }

  // ── Canaux aléatoires ──
  function handleRandomize() {
    setAps((prev) =>
      prev.map((ap) => ({ ...ap, channel: CHANNELS[Math.floor(Math.random() * CHANNELS.length)] }))
    );
    setResult(null);
  }

  // ── Reset ──
  function handleReset() {
    setAps(INITIAL_APS);
    setLinks(INITIAL_LINKS);
    setSelectedAP(null);
    setLinkMode(false);
    setResult(null);
  }

  function isConflict(a, b) {
    const apA = aps.find((ap) => ap.id === a);
    const apB = aps.find((ap) => ap.id === b);
    return apA && apB && apA.channel === apB.channel;
  }

  const conflictedIds = useMemo(() => new Set(getConflictedAPIds(aps, links)), [aps, links]);

  return (
    <div className="app">
      {/* ── HEADER ── */}
      <header className="header">
        <div className="header-left">
          <div className="header-badge">ADOMC · Min-Conflicts</div>
          <h1 className="header-title">
            <span className="title-wifi">Wi-Fi</span> Channel Optimizer
          </h1>
          <p className="header-sub">
            Attribution automatique des canaux par heuristique Min-Conflicts
          </p>
        </div>

        <div className="header-stats">
          <div className={`stat-box ${conflicts === 0 ? "stat-ok" : "stat-bad"}`}>
            <span className="stat-label">CONFLITS</span>
            <span className="stat-value">{conflicts}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">ACCESS POINTS</span>
            <span className="stat-value">{aps.length}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">LIAISONS</span>
            <span className="stat-value">{links.length}</span>
          </div>
        </div>
      </header>

      <div className="main-layout">
        {/* ── ÉDITEUR ── */}
        <section className="editor-section">
          <div className="toolbar">
            <button className="btn btn-default" onClick={handleAddAP}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
              Ajouter AP
            </button>

            <button
              className={`btn ${linkMode ? "btn-active" : "btn-default"}`}
              onClick={() => { setLinkMode((p) => !p); setSelectedAP(null); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              {linkMode ? "Mode liaison ON" : "Mode liaison"}
            </button>

            <button className="btn btn-default" onClick={handleRandomize}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
              Canaux aléatoires
            </button>

            <button className={`btn btn-run ${running ? "btn-running" : ""}`} onClick={handleRun} disabled={running}>
              {running ? (
                <><span className="spinner" /> Calcul…</>
              ) : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>Lancer Min-Conflicts</>
              )}
            </button>

            <button className="btn btn-danger" onClick={handleReset}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.1"/></svg>
              Reset
            </button>
          </div>

          {/* Canvas */}
          <div
            ref={canvasRef}
            className={`canvas ${linkMode ? "canvas-linkmode" : ""} ${dragging ? "canvas-dragging" : ""}`}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
          >
            <div className="canvas-inner">
              {/* SVG liens */}
              <svg className="links-svg">
                {/* Lignes de signal (arc glow) */}
                <defs>
                  <filter id="glow-red">
                    <feGaussianBlur stdDeviation="3" result="blur"/>
                    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                  <filter id="glow-blue">
                    <feGaussianBlur stdDeviation="2" result="blur"/>
                    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                </defs>

                {links.map(([a, b]) => {
                  const apA = aps.find((ap) => ap.id === a);
                  const apB = aps.find((ap) => ap.id === b);
                  if (!apA || !apB) return null;
                  const conflict = isConflict(a, b);
                  return (
                    <g key={`${a}-${b}`}>
                      {conflict && (
                        <line
                          x1={apA.x} y1={apA.y} x2={apB.x} y2={apB.y}
                          className="link-glow-conflict"
                        />
                      )}
                      <line
                        x1={apA.x} y1={apA.y} x2={apB.x} y2={apB.y}
                        className={conflict ? "link link-conflict" : "link link-ok"}
                      />
                    </g>
                  );
                })}

                {/* Ligne de preview lors de la sélection en mode liaison */}
                {linkMode && selectedAP && (() => {
                  const ap = aps.find((a) => a.id === selectedAP);
                  return ap ? (
                    <circle cx={ap.x} cy={ap.y} r="52" className="link-preview-ring" />
                  ) : null;
                })()}
              </svg>

              {/* Nœuds AP */}
              {aps.map((ap) => {
                const color = CHANNEL_COLORS[ap.channel];
                const hasConflict = conflictedIds.has(ap.id);
                return (
                  <div
                    key={ap.id}
                    className={[
                      "ap-node",
                      selectedAP === ap.id ? "ap-selected" : "",
                      hasConflict ? "ap-conflict" : "ap-ok",
                    ].join(" ")}
                    style={{ left: ap.x, top: ap.y, "--ch-color": color }}
                    onMouseDown={(e) => handleAPMouseDown(e, ap)}
                  >
                    {/* Anneau signal */}
                    <div className="ap-ring" />
                    <div className="ap-ring ap-ring-2" />

                    {/* Corps */}
                    <div className="ap-body">
                      <button
                        className="ap-delete"
                        onClick={(e) => { e.stopPropagation(); handleDeleteAP(ap.id); }}
                        title="Supprimer"
                      >×</button>

                      <div className="ap-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
                          <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
                          <path d="M10.54 16.1a5 5 0 0 1 2.92 0"/>
                          <line x1="12" y1="20" x2="12" y2="20"/>
                        </svg>
                      </div>

                      <strong className="ap-name">{ap.name}</strong>
                      <span className="ap-channel">{CHANNEL_LABELS[ap.channel]}</span>
                    </div>

                    {/* Indicateur conflit */}
                    {hasConflict && <div className="ap-alert">!</div>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="canvas-hint">
            <span>💡</span>
            Double-cliquer sur la zone pour ajouter un AP — Activer <strong>Mode liaison</strong> puis cliquer sur deux AP pour créer / supprimer une liaison d'interférence
          </div>
        </section>

        {/* ── PANNEAU LATÉRAL ── */}
        <aside className="side-panel">
          {/* Tabs */}
          <div className="tabs">
            <button className={`tab ${activeTab === "aps" ? "tab-active" : ""}`} onClick={() => setActiveTab("aps")}>
              Access Points
            </button>
            <button className={`tab ${activeTab === "result" ? "tab-active" : ""}`} onClick={() => setActiveTab("result")}>
              Résultat
              {result && <span className={`tab-badge ${result.success ? "badge-ok" : "badge-warn"}`}>{result.success ? "✓" : "!"}</span>}
            </button>
            <button className={`tab ${activeTab === "info" ? "tab-active" : ""}`} onClick={() => setActiveTab("info")}>
              Principe
            </button>
          </div>

          <div className="tab-content">
            {/* ── Tab AP ── */}
            {activeTab === "aps" && (
              <div className="ap-list">
                {aps.length === 0 && (
                  <p className="empty-msg">Aucun point d'accès. Cliquez sur "Ajouter AP" ou double-cliquez sur la zone.</p>
                )}
                {aps.map((ap) => {
                  const color = CHANNEL_COLORS[ap.channel];
                  const hasConflict = conflictedIds.has(ap.id);
                  return (
                    <div className={`ap-row ${hasConflict ? "ap-row-conflict" : ""}`} key={ap.id} style={{ "--ch-color": color }}>
                      <div className="ap-row-indicator" />
                      <div className="ap-row-info">
                        <strong>{ap.name}</strong>
                        <small>x={Math.round(ap.x)}, y={Math.round(ap.y)}</small>
                      </div>
                      <select
                        value={ap.channel}
                        onChange={(e) => handleChannelChange(ap.id, e.target.value)}
                        style={{ borderColor: color }}
                      >
                        {CHANNELS.map((ch) => (
                          <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>
                        ))}
                      </select>
                      {hasConflict && <span className="conflict-badge">⚠</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Tab Résultat ── */}
            {activeTab === "result" && (
              <div className="result-panel">
                {!result ? (
                  <div className="result-empty">
                    <div className="result-empty-icon">▶</div>
                    <p>Lance le calcul Min-Conflicts pour voir la solution proposée.</p>
                  </div>
                ) : (
                  <>
                    <div className={`result-status ${result.success ? "status-success" : "status-warning"}`}>
                      {result.success ? "✓ Solution optimale trouvée" : "⚠ Solution améliorée — conflits résiduels"}
                    </div>

                    <div className="result-grid">
                      <div className="result-metric">
                        <span className="rm-label">Conflits avant</span>
                        <span className="rm-value rm-bad">{result.before}</span>
                      </div>
                      <div className="result-metric">
                        <span className="rm-label">Conflits après</span>
                        <span className={`rm-value ${result.after === 0 ? "rm-good" : "rm-warn"}`}>{result.after}</span>
                      </div>
                      <div className="result-metric">
                        <span className="rm-label">Itérations</span>
                        <span className="rm-value rm-neutral">{result.iterations}</span>
                      </div>
                      <div className="result-metric">
                        <span className="rm-label">Réduction</span>
                        <span className="rm-value rm-good">
                          {result.before > 0
                            ? `${Math.round(((result.before - result.after) / result.before) * 100)}%`
                            : "—"}
                        </span>
                      </div>
                    </div>

                    {result.history.length > 0 && (
                      <>
                        <h3 className="log-title">Journal des modifications</h3>
                        <div className="log-list">
                          {result.history.slice(-12).map((entry, i) => (
                            <div className="log-entry" key={i}>
                              <span className="log-iter">#{entry.iteration}</span>
                              <span className="log-name">{entry.apName}</span>
                              <span className="log-ch" style={{ color: CHANNEL_COLORS[entry.channel] }}>
                                → CH {entry.channel}
                              </span>
                              <span className="log-conf">{entry.conflicts} ⚡</span>
                            </div>
                          ))}
                          {result.history.length > 12 && (
                            <div className="log-entry log-more">…{result.history.length - 12} autres modifications</div>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Tab Info ── */}
            {activeTab === "info" && (
              <div className="info-panel">
                <div className="info-section">
                  <h3>Modélisation CSP</h3>
                  <div className="info-table">
                    <div className="info-row">
                      <span className="info-key">Variables</span>
                      <span className="info-val">Points d'accès AP<sub>i</sub></span>
                    </div>
                    <div className="info-row">
                      <span className="info-key">Domaine</span>
                      <span className="info-val">Canaux {"{1, 6, 11}"}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-key">Contraintes</span>
                      <span className="info-val">AP<sub>i</sub> ≠ AP<sub>j</sub> si reliés</span>
                    </div>
                    <div className="info-row">
                      <span className="info-key">Objectif</span>
                      <span className="info-val">min Σ conflits</span>
                    </div>
                  </div>
                </div>

                <div className="info-section">
                  <h3>Algorithme Min-Conflicts</h3>
                  <ol className="info-steps">
                    <li>Initialisation aléatoire des canaux</li>
                    <li>Sélection d'un AP en conflit au hasard</li>
                    <li>Test de tous les canaux disponibles</li>
                    <li>Attribution du canal minimisant les conflits</li>
                    <li>Répétition jusqu'à 0 conflit ou max itérations</li>
                  </ol>
                </div>

                <div className="info-section">
                  <h3>Légende</h3>
                  <div className="legend">
                    <div className="legend-row">
                      <span className="legend-dot" style={{ background: "#00e5ff" }} /> Canal 1
                    </div>
                    <div className="legend-row">
                      <span className="legend-dot" style={{ background: "#69ff47" }} /> Canal 6
                    </div>
                    <div className="legend-row">
                      <span className="legend-dot" style={{ background: "#ff6b35" }} /> Canal 11
                    </div>
                    <div className="legend-row">
                      <span className="legend-line conflict-line" /> Liaison en conflit
                    </div>
                    <div className="legend-row">
                      <span className="legend-line ok-line" /> Liaison sans conflit
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}