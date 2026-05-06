import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const CHANNELS = [1, 6, 11];

const CHANNEL_COLORS = {
  1: "#00e5ff",
  6: "#69ff47",
  11: "#ff6b35",
};

const CHANNEL_LABELS = {
  1: "CH 1",
  6: "CH 6",
  11: "CH 11",
};

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

function normalizeLink(a, b) {
  return a < b ? [a, b] : [b, a];
}

function sameLink(link, a, b) {
  const [x, y] = normalizeLink(a, b);
  return link[0] === x && link[1] === y;
}

function countConflicts(aps, links) {
  let count = 0;

  for (const [a, b] of links) {
    const apA = aps.find((ap) => ap.id === a);
    const apB = aps.find((ap) => ap.id === b);

    if (apA && apB && apA.channel === apB.channel) {
      count++;
    }
  }

  return count;
}

function getConflictedAPIds(aps, links) {
  const conflicted = new Set();

  for (const [a, b] of links) {
    const apA = aps.find((ap) => ap.id === a);
    const apB = aps.find((ap) => ap.id === b);

    if (apA && apB && apA.channel === apB.channel) {
      conflicted.add(a);
      conflicted.add(b);
    }
  }

  return Array.from(conflicted);
}

function conflictScoreForChannel(apId, channel, aps, links) {
  let score = 0;

  for (const [a, b] of links) {
    if (a !== apId && b !== apId) continue;

    const neighborId = a === apId ? b : a;
    const neighbor = aps.find((ap) => ap.id === neighborId);

    if (neighbor && neighbor.channel === channel) {
      score++;
    }
  }

  return score;
}

function cloneAps(aps) {
  return aps.map((ap) => ({ ...ap }));
}

function buildMinConflictsSimulation(aps, links, maxIterations = 1000) {
  let current = cloneAps(aps);
  const initialAps = cloneAps(aps);
  const before = countConflicts(current, links);
  const steps = [];

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const conflictsBefore = countConflicts(current, links);

    if (conflictsBefore === 0) {
      break;
    }

    const conflictedIds = getConflictedAPIds(current, links);

    if (conflictedIds.length === 0) {
      break;
    }

    const selectedId =
      conflictedIds[Math.floor(Math.random() * conflictedIds.length)];

    const selectedBefore = current.find((ap) => ap.id === selectedId);

    const candidates = CHANNELS.map((channel) => ({
      channel,
      score: conflictScoreForChannel(selectedId, channel, current, links),
    }));

    const minScore = Math.min(...candidates.map((candidate) => candidate.score));

    const bestChannels = candidates
      .filter((candidate) => candidate.score === minScore)
      .map((candidate) => candidate.channel);

    const chosenChannel =
      bestChannels[Math.floor(Math.random() * bestChannels.length)];

    const afterAps = current.map((ap) =>
      ap.id === selectedId ? { ...ap, channel: chosenChannel } : ap
    );

    const conflictsAfter = countConflicts(afterAps, links);

    steps.push({
      iteration,
      apId: selectedId,
      apName: selectedBefore?.name || `AP-${selectedId}`,
      previousChannel: selectedBefore?.channel,
      chosenChannel,
      candidates,
      conflictsBefore,
      conflictsAfter,
      afterAps: cloneAps(afterAps),
      conflictedIdsBefore: getConflictedAPIds(current, links),
    });

    current = afterAps;
  }

  const after = countConflicts(current, links);

  return {
    initialAps,
    steps,
    summary: {
      before,
      after,
      iterations: steps.length,
      success: after === 0,
      history: steps,
      solution: cloneAps(current),
    },
  };
}

export default function App() {
  const canvasRef = useRef(null);

  const [aps, setAps] = useState(INITIAL_APS);
  const [links, setLinks] = useState(INITIAL_LINKS);

  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [linkMode, setLinkMode] = useState(false);
  const [selectedAP, setSelectedAP] = useState(null);

  const [activeTab, setActiveTab] = useState("aps");
  const [result, setResult] = useState(null);

  const [editingId, setEditingId] = useState(null);

  const [constraintA, setConstraintA] = useState("");
  const [constraintB, setConstraintB] = useState("");

  const [simulation, setSimulation] = useState(null);
  const [playIndex, setPlayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeStep, setActiveStep] = useState(null);
  const [simulationSpeed, setSimulationSpeed] = useState(900);

  const conflicts = useMemo(() => countConflicts(aps, links), [aps, links]);

  const conflictedIds = useMemo(
    () => new Set(getConflictedAPIds(aps, links)),
    [aps, links]
  );

  const visibleLogs = useMemo(() => {
    if (!simulation) return [];
    return simulation.steps.slice(0, playIndex);
  }, [simulation, playIndex]);

  function clearResultAndSimulation() {
    setResult(null);
    setSimulation(null);
    setPlayIndex(0);
    setIsPlaying(false);
    setActiveStep(null);
  }

  function getCanvasPosition(event) {
    const rect = canvasRef.current.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function handleAddAP() {
    const nextId = aps.length > 0 ? Math.max(...aps.map((ap) => ap.id)) + 1 : 1;

    const newAP = {
      id: nextId,
      name: `AP-${String(nextId).padStart(2, "0")}`,
      x: 110 + Math.random() * 520,
      y: 90 + Math.random() * 380,
      channel: CHANNELS[Math.floor(Math.random() * CHANNELS.length)],
    };

    setAps((prev) => [...prev, newAP]);
    clearResultAndSimulation();
  }

  function handleDoubleClick(event) {
    if (
      event.target !== canvasRef.current &&
      !event.target.classList.contains("canvas-inner")
    ) {
      return;
    }

    const position = getCanvasPosition(event);
    const nextId = aps.length > 0 ? Math.max(...aps.map((ap) => ap.id)) + 1 : 1;

    const newAP = {
      id: nextId,
      name: `AP-${String(nextId).padStart(2, "0")}`,
      x: position.x,
      y: position.y,
      channel: CHANNELS[Math.floor(Math.random() * CHANNELS.length)],
    };

    setAps((prev) => [...prev, newAP]);
    clearResultAndSimulation();
  }

  function handleDeleteAP(id) {
    setAps((prev) => prev.filter((ap) => ap.id !== id));
    setLinks((prev) => prev.filter(([a, b]) => a !== id && b !== id));
    setSelectedAP(null);
    setEditingId(null);
    clearResultAndSimulation();
  }

  function handleNameChange(apId, value) {
    setAps((prev) =>
      prev.map((ap) => (ap.id === apId ? { ...ap, name: value } : ap))
    );
    clearResultAndSimulation();
  }

  function handleChannelChange(apId, channel) {
    setAps((prev) =>
      prev.map((ap) =>
        ap.id === apId ? { ...ap, channel: Number(channel) } : ap
      )
    );
    clearResultAndSimulation();
  }

  function handleAPMouseDown(event, ap) {
    event.stopPropagation();

    if (event.target.closest("button") || event.target.closest("input")) {
      return;
    }

    if (linkMode) {
      handleSelectForLink(ap.id);
      return;
    }

    const position = getCanvasPosition(event);

    setDragging(ap.id);
    setDragOffset({
      x: position.x - ap.x,
      y: position.y - ap.y,
    });
  }

  const handleMouseMove = useCallback(
    (event) => {
      if (!dragging) return;

      const position = getCanvasPosition(event);

      setAps((prev) =>
        prev.map((ap) =>
          ap.id === dragging
            ? {
                ...ap,
                x: Math.max(48, Math.min(position.x - dragOffset.x, 760)),
                y: Math.max(48, Math.min(position.y - dragOffset.y, 520)),
              }
            : ap
        )
      );
    },
    [dragging, dragOffset]
  );

  function handleMouseUp() {
    if (dragging) {
      clearResultAndSimulation();
    }

    setDragging(null);
  }

  function handleSelectForLink(apId) {
    if (!selectedAP) {
      setSelectedAP(apId);
      return;
    }

    if (selectedAP === apId) {
      setSelectedAP(null);
      return;
    }

    const [a, b] = normalizeLink(selectedAP, apId);

    setLinks((prev) => {
      const exists = prev.some((link) => sameLink(link, a, b));

      if (exists) {
        return prev.filter((link) => !sameLink(link, a, b));
      }

      return [...prev, [a, b]];
    });

    setSelectedAP(null);
    clearResultAndSimulation();
  }

  function handleAddConstraint() {
    const a = Number(constraintA);
    const b = Number(constraintB);

    if (!a || !b || a === b) return;

    const [x, y] = normalizeLink(a, b);

    const exists = links.some((link) => sameLink(link, x, y));

    if (!exists) {
      setLinks((prev) => [...prev, [x, y]]);
      clearResultAndSimulation();
    }

    setConstraintA("");
    setConstraintB("");
  }

  function handleRemoveConstraint(a, b) {
    setLinks((prev) => prev.filter((link) => !sameLink(link, a, b)));
    clearResultAndSimulation();
  }

  function handleRandomize() {
    setAps((prev) =>
      prev.map((ap) => ({
        ...ap,
        channel: CHANNELS[Math.floor(Math.random() * CHANNELS.length)],
      }))
    );

    clearResultAndSimulation();
  }

  function handleReset() {
    setAps(cloneAps(INITIAL_APS));
    setLinks(INITIAL_LINKS.map((link) => [...link]));
    setSelectedAP(null);
    setLinkMode(false);
    setEditingId(null);
    setConstraintA("");
    setConstraintB("");
    setResult(null);
    setSimulation(null);
    setPlayIndex(0);
    setIsPlaying(false);
    setActiveStep(null);
    setActiveTab("aps");
  }

  function handleStartSimulation() {
    const generated = buildMinConflictsSimulation(aps, links, 1000);

    setSimulation(generated);
    setResult(null);
    setPlayIndex(0);
    setActiveStep(null);
    setAps(cloneAps(generated.initialAps));
    setIsPlaying(generated.steps.length > 0);
    setActiveTab("simulation");

    if (generated.steps.length === 0) {
      setResult(generated.summary);
    }
  }

  function applySimulationIndex(index) {
    if (!simulation) return;

    if (index <= 0) {
      setAps(cloneAps(simulation.initialAps));
      setActiveStep(null);
      setPlayIndex(0);
      return;
    }

    const step = simulation.steps[index - 1];

    if (!step) return;

    setAps(cloneAps(step.afterAps));
    setActiveStep(step);
    setPlayIndex(index);

    if (index >= simulation.steps.length) {
      setIsPlaying(false);
      setResult(simulation.summary);
    }
  }

  function handlePlayPause() {
    if (!simulation) return;

    if (playIndex >= simulation.steps.length) {
      applySimulationIndex(0);
      setIsPlaying(true);
      return;
    }

    setIsPlaying((prev) => !prev);
  }

  function handleNextStep() {
    if (!simulation) return;

    setIsPlaying(false);
    applySimulationIndex(Math.min(playIndex + 1, simulation.steps.length));
  }

  function handleGoToEnd() {
    if (!simulation) return;

    setIsPlaying(false);
    applySimulationIndex(simulation.steps.length);
    setResult(simulation.summary);
  }

  function handleRestartSimulation() {
    if (!simulation) return;

    setIsPlaying(false);
    applySimulationIndex(0);
    setResult(null);
    setTimeout(() => setIsPlaying(true), 100);
  }

  useEffect(() => {
    if (!simulation || !isPlaying) return;

    if (playIndex >= simulation.steps.length) {
      setIsPlaying(false);
      setResult(simulation.summary);
      return;
    }

    const timer = setTimeout(() => {
      applySimulationIndex(playIndex + 1);
    }, simulationSpeed);

    return () => clearTimeout(timer);
  }, [simulation, isPlaying, playIndex, simulationSpeed]);

  function isConflict(a, b) {
    const apA = aps.find((ap) => ap.id === a);
    const apB = aps.find((ap) => ap.id === b);

    return apA && apB && apA.channel === apB.channel;
  }

  function getAPName(id) {
    return aps.find((ap) => ap.id === id)?.name || `AP-${id}`;
  }

  const progress =
    simulation && simulation.steps.length > 0
      ? Math.round((playIndex / simulation.steps.length) * 100)
      : 0;

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="header-badge">Min-Conflicts · Réseaux Wi-Fi</div>

          <h1 className="header-title">
            <span>Wi-Fi</span> Channel Optimizer
          </h1>

          <p className="header-subtitle">
            Éditeur dynamique pour simuler l’attribution automatique des canaux
            Wi-Fi avec réduction des interférences.
          </p>
        </div>

        <div className="header-stats">
          <div className={`stat-box ${conflicts === 0 ? "stat-ok" : "stat-bad"}`}>
            <small>Conflits</small>
            <strong>{conflicts}</strong>
          </div>

          <div className="stat-box">
            <small>Access points</small>
            <strong>{aps.length}</strong>
          </div>

          <div className="stat-box">
            <small>Contraintes</small>
            <strong>{links.length}</strong>
          </div>
        </div>
      </header>

      <main className="main-layout">
        <section className="editor-section">
          <div className="toolbar">
            <button className="btn" onClick={handleAddAP}>
              Ajouter AP
            </button>

            <button
              className={`btn ${linkMode ? "btn-active" : ""}`}
              onClick={() => {
                setLinkMode((prev) => !prev);
                setSelectedAP(null);
              }}
            >
              {linkMode ? "Mode contrainte actif" : "Mode contrainte"}
            </button>

            <button className="btn" onClick={handleRandomize}>
              Canaux aléatoires
            </button>

            <button className="btn btn-run" onClick={handleStartSimulation}>
              Lancer la simulation
            </button>

            <button className="btn btn-danger" onClick={handleReset}>
              Réinitialiser
            </button>
          </div>

          <div
            ref={canvasRef}
            className={`canvas ${linkMode ? "canvas-linkmode" : ""} ${
              dragging ? "canvas-dragging" : ""
            }`}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
          >
            <div className="canvas-inner">
              <svg className="links-svg">
                {links.map(([a, b]) => {
                  const apA = aps.find((ap) => ap.id === a);
                  const apB = aps.find((ap) => ap.id === b);

                  if (!apA || !apB) return null;

                  const conflict = isConflict(a, b);

                  return (
                    <g key={`${a}-${b}`}>
                      {conflict && (
                        <line
                          x1={apA.x}
                          y1={apA.y}
                          x2={apB.x}
                          y2={apB.y}
                          className="link-glow-conflict"
                        />
                      )}

                      <line
                        x1={apA.x}
                        y1={apA.y}
                        x2={apB.x}
                        y2={apB.y}
                        className={
                          conflict ? "link link-conflict" : "link link-ok"
                        }
                      />
                    </g>
                  );
                })}

                {linkMode &&
                  selectedAP &&
                  (() => {
                    const ap = aps.find((item) => item.id === selectedAP);

                    return ap ? (
                      <circle
                        cx={ap.x}
                        cy={ap.y}
                        r="54"
                        className="link-preview-ring"
                      />
                    ) : null;
                  })()}
              </svg>

              {aps.map((ap) => {
                const color = CHANNEL_COLORS[ap.channel];
                const hasConflict = conflictedIds.has(ap.id);
                const isActiveSimulationAP = activeStep?.apId === ap.id;

                return (
                  <div
                    key={ap.id}
                    className={[
                      "ap-node",
                      selectedAP === ap.id ? "ap-selected" : "",
                      hasConflict ? "ap-conflict" : "ap-ok",
                      isActiveSimulationAP ? "ap-simulation-active" : "",
                    ].join(" ")}
                    style={{
                      left: ap.x,
                      top: ap.y,
                      "--ch-color": color,
                    }}
                    onMouseDown={(event) => handleAPMouseDown(event, ap)}
                  >
                    <div className="ap-zone" />

                    <div className="ap-body">
                      <button
                        className="ap-delete"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteAP(ap.id);
                        }}
                        title="Supprimer"
                      >
                        ×
                      </button>

                      <div className="ap-icon">
                        <svg
                          width="21"
                          height="21"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                          <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                          <path d="M12 20h.01" />
                        </svg>
                      </div>

                      <strong className="ap-name">{ap.name}</strong>
                      <span className="ap-channel">
                        {CHANNEL_LABELS[ap.channel]}
                      </span>
                    </div>

                    {hasConflict && <div className="ap-alert">!</div>}

                    {isActiveSimulationAP && (
                      <div className="simulation-badge">choisi</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="canvas-hint">
            Double-clique sur la zone pour ajouter un AP. Active le mode
            contrainte, puis clique sur deux AP pour créer ou supprimer une
            liaison d’interférence.
          </div>

          {simulation && (
            <div className="simulation-controls">
              <div className="simulation-top">
                <div>
                  <strong>Simulation Min-Conflicts</strong>
                  <span>
                    Étape {playIndex} / {simulation.steps.length}
                  </span>
                </div>

                <select
                  value={simulationSpeed}
                  onChange={(event) =>
                    setSimulationSpeed(Number(event.target.value))
                  }
                >
                  <option value={1300}>Lent</option>
                  <option value={900}>Normal</option>
                  <option value={450}>Rapide</option>
                </select>
              </div>

              <div className="progress-bar">
                <div style={{ width: `${progress}%` }} />
              </div>

              <div className="simulation-buttons">
                <button className="btn" onClick={handlePlayPause}>
                  {isPlaying ? "Pause" : "Play"}
                </button>

                <button className="btn" onClick={handleNextStep}>
                  Étape suivante
                </button>

                <button className="btn" onClick={handleGoToEnd}>
                  Aller à la fin
                </button>

                <button className="btn" onClick={handleRestartSimulation}>
                  Rejouer
                </button>
              </div>

              {activeStep ? (
                <div className="current-step">
                  <strong>
                    #{activeStep.iteration} — {activeStep.apName} choisi au
                    hasard
                  </strong>

                  <p>
                    Canal précédent :{" "}
                    <span
                      style={{
                        color: CHANNEL_COLORS[activeStep.previousChannel],
                      }}
                    >
                      CH {activeStep.previousChannel}
                    </span>{" "}
                    → canal choisi :{" "}
                    <span
                      style={{ color: CHANNEL_COLORS[activeStep.chosenChannel] }}
                    >
                      CH {activeStep.chosenChannel}
                    </span>
                  </p>

                  <div className="candidate-list">
                    {activeStep.candidates.map((candidate) => (
                      <div
                        key={candidate.channel}
                        className={
                          candidate.channel === activeStep.chosenChannel
                            ? "candidate candidate-selected"
                            : "candidate"
                        }
                      >
                        <span>CH {candidate.channel}</span>
                        <strong>{candidate.score} conflit(s)</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="current-step">
                  <strong>État initial</strong>
                  <p>
                    La simulation va sélectionner un point d’accès en conflit,
                    tester les canaux disponibles, puis appliquer le meilleur
                    choix.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="side-panel">
          <div className="tabs">
            <button
              className={`tab ${activeTab === "aps" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("aps")}
            >
              AP
            </button>

            <button
              className={`tab ${
                activeTab === "constraints" ? "tab-active" : ""
              }`}
              onClick={() => setActiveTab("constraints")}
            >
              Contraintes
            </button>

            <button
              className={`tab ${
                activeTab === "simulation" ? "tab-active" : ""
              }`}
              onClick={() => setActiveTab("simulation")}
            >
              Simulation
            </button>

            <button
              className={`tab ${activeTab === "info" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("info")}
            >
              Principe
            </button>
          </div>

          <div className="tab-content">
            {activeTab === "aps" && (
              <div className="ap-list">
                {aps.length === 0 && (
                  <p className="empty-message">
                    Aucun point d’accès. Clique sur “Ajouter AP”.
                  </p>
                )}

                {aps.map((ap) => {
                  const color = CHANNEL_COLORS[ap.channel];
                  const hasConflict = conflictedIds.has(ap.id);

                  return (
                    <div
                      key={ap.id}
                      className={`ap-row ${hasConflict ? "ap-row-conflict" : ""}`}
                      style={{ "--ch-color": color }}
                    >
                      <div className="ap-row-indicator" />

                      <div className="ap-row-info">
                        {editingId === ap.id ? (
                          <input
                            value={ap.name}
                            className="name-input"
                            autoFocus
                            onChange={(event) =>
                              handleNameChange(ap.id, event.target.value)
                            }
                            onBlur={() => setEditingId(null)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                setEditingId(null);
                              }
                            }}
                          />
                        ) : (
                          <strong
                            className="editable-name"
                            onDoubleClick={() => setEditingId(ap.id)}
                            title="Double-cliquer pour modifier"
                          >
                            {ap.name}
                          </strong>
                        )}

                        <small>
                          x={Math.round(ap.x)}, y={Math.round(ap.y)}
                        </small>
                      </div>

                      <select
                        value={ap.channel}
                        onChange={(event) =>
                          handleChannelChange(ap.id, event.target.value)
                        }
                        style={{ borderColor: color }}
                      >
                        {CHANNELS.map((channel) => (
                          <option key={channel} value={channel}>
                            {CHANNEL_LABELS[channel]}
                          </option>
                        ))}
                      </select>

                      {hasConflict && <span className="conflict-badge">!</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === "constraints" && (
              <div className="constraints-panel">
                <div className="constraint-form">
                  <label>Ajouter une contrainte d’interférence</label>

                  <div className="constraint-inputs">
                    <select
                      value={constraintA}
                      onChange={(event) => setConstraintA(event.target.value)}
                    >
                      <option value="">AP A</option>
                      {aps.map((ap) => (
                        <option key={ap.id} value={ap.id}>
                          {ap.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={constraintB}
                      onChange={(event) => setConstraintB(event.target.value)}
                    >
                      <option value="">AP B</option>
                      {aps.map((ap) => (
                        <option key={ap.id} value={ap.id}>
                          {ap.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button className="btn btn-full" onClick={handleAddConstraint}>
                    Ajouter la contrainte
                  </button>
                </div>

                <div className="constraint-list">
                  {links.length === 0 ? (
                    <p className="empty-message">
                      Aucune contrainte. Ajoute une liaison entre deux AP.
                    </p>
                  ) : (
                    links.map(([a, b]) => {
                      const conflict = isConflict(a, b);

                      return (
                        <div
                          className={`constraint-row ${
                            conflict ? "constraint-conflict" : ""
                          }`}
                          key={`${a}-${b}`}
                        >
                          <div>
                            <strong>
                              {getAPName(a)} ↔ {getAPName(b)}
                            </strong>
                            <small>
                              {conflict
                                ? "Conflit actif : même canal"
                                : "Aucun conflit"}
                            </small>
                          </div>

                          <button
                            className="remove-link"
                            onClick={() => handleRemoveConstraint(a, b)}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {activeTab === "simulation" && (
              <div className="result-panel">
                {!simulation ? (
                  <div className="result-empty">
                    <strong>Aucune simulation lancée</strong>
                    <p>
                      Clique sur “Lancer la simulation” pour voir les choix de
                      l’algorithme étape par étape.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="result-grid">
                      <div className="result-metric">
                        <span>Conflits avant</span>
                        <strong className="metric-bad">
                          {simulation.summary.before}
                        </strong>
                      </div>

                      <div className="result-metric">
                        <span>Conflits actuels</span>
                        <strong
                          className={conflicts === 0 ? "metric-good" : "metric-bad"}
                        >
                          {conflicts}
                        </strong>
                      </div>

                      <div className="result-metric">
                        <span>Progression</span>
                        <strong className="metric-neutral">{progress}%</strong>
                      </div>

                      <div className="result-metric">
                        <span>Étapes</span>
                        <strong className="metric-neutral">
                          {playIndex}/{simulation.steps.length}
                        </strong>
                      </div>
                    </div>

                    {result && (
                      <div
                        className={`result-status ${
                          result.success ? "status-success" : "status-warning"
                        }`}
                      >
                        {result.success
                          ? "Solution trouvée : aucun conflit restant."
                          : "Simulation terminée avec des conflits restants."}
                      </div>
                    )}

                    <h3 className="log-title">Journal de résolution</h3>

                    <div className="log-list">
                      {visibleLogs.length === 0 ? (
                        <p className="empty-message">
                          Le journal s’affichera pendant la simulation.
                        </p>
                      ) : (
                        visibleLogs.map((step) => (
                          <div className="log-entry" key={step.iteration}>
                            <span className="log-iter">#{step.iteration}</span>

                            <span className="log-name">{step.apName}</span>

                            <span
                              className="log-ch"
                              style={{
                                color: CHANNEL_COLORS[step.chosenChannel],
                              }}
                            >
                              CH {step.previousChannel} → CH{" "}
                              {step.chosenChannel}
                            </span>

                            <span className="log-conf">
                              {step.conflictsAfter} conflit(s)
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === "info" && (
              <div className="info-panel">
                <section>
                  <h3>Modélisation</h3>

                  <div className="info-row">
                    <span>Variables</span>
                    <strong>Points d’accès Wi-Fi</strong>
                  </div>

                  <div className="info-row">
                    <span>Valeurs</span>
                    <strong>Canaux 1, 6 et 11</strong>
                  </div>

                  <div className="info-row">
                    <span>Contraintes</span>
                    <strong>Deux AP reliés ne doivent pas avoir le même canal</strong>
                  </div>

                  <div className="info-row">
                    <span>Objectif</span>
                    <strong>Minimiser le nombre total de conflits</strong>
                  </div>
                </section>

                <section>
                  <h3>Étapes de Min-Conflicts</h3>

                  <ol className="info-steps">
                    <li>Détecter les points d’accès en conflit.</li>
                    <li>Choisir au hasard un AP parmi ceux en conflit.</li>
                    <li>Tester chaque canal possible.</li>
                    <li>Choisir le canal qui produit le moins de conflits.</li>
                    <li>Répéter jusqu’à obtenir une solution correcte.</li>
                  </ol>
                </section>

                <section>
                  <h3>Légende</h3>

                  <div className="legend">
                    <div>
                      <span
                        className="legend-dot"
                        style={{ background: CHANNEL_COLORS[1] }}
                      />
                      Canal 1
                    </div>

                    <div>
                      <span
                        className="legend-dot"
                        style={{ background: CHANNEL_COLORS[6] }}
                      />
                      Canal 6
                    </div>

                    <div>
                      <span
                        className="legend-dot"
                        style={{ background: CHANNEL_COLORS[11] }}
                      />
                      Canal 11
                    </div>

                    <div>
                      <span className="legend-line conflict-line" />
                      Liaison en conflit
                    </div>

                    <div>
                      <span className="legend-line ok-line" />
                      Liaison sans conflit
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}