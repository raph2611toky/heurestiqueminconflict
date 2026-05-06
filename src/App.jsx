import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const INITIAL_CHANNELS = [
  { id: 1, label: "CH 1", color: "#00e5ff" },
  { id: 6, label: "CH 6", color: "#69ff47" },
  { id: 11, label: "CH 11", color: "#ff6b35" },
];

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

const DEFAULT_COLORS = [
  "#00e5ff",
  "#69ff47",
  "#ff6b35",
  "#fbbf24",
  "#a78bfa",
  "#fb7185",
  "#38bdf8",
  "#34d399",
];

function normalizeLink(a, b) {
  return a < b ? [a, b] : [b, a];
}

function sameLink(link, a, b) {
  const [x, y] = normalizeLink(a, b);
  return link[0] === x && link[1] === y;
}

function cloneAps(aps) {
  return aps.map((ap) => ({ ...ap }));
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

function buildMinConflictsSimulation(aps, links, channels, maxIterations = 1000) {
  const channelIds = channels.map((channel) => channel.id);

  let current = cloneAps(aps);
  const initialAps = cloneAps(aps);
  const before = countConflicts(current, links);
  const steps = [];

  if (channelIds.length === 0) {
    return {
      initialAps,
      steps,
      summary: {
        before,
        after: before,
        iterations: 0,
        success: before === 0,
        history: [],
        solution: cloneAps(current),
      },
    };
  }

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const conflictsBefore = countConflicts(current, links);

    if (conflictsBefore === 0) break;

    const conflictedIds = getConflictedAPIds(current, links);
    if (conflictedIds.length === 0) break;

    const selectedId =
      conflictedIds[Math.floor(Math.random() * conflictedIds.length)];

    const selectedBefore = current.find((ap) => ap.id === selectedId);

    const candidates = channelIds.map((channel) => ({
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

  const [channels, setChannels] = useState(INITIAL_CHANNELS);
  const [aps, setAps] = useState(INITIAL_APS);
  const [links, setLinks] = useState(INITIAL_LINKS);

  const [draggingAP, setDraggingAP] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });

  const [linkMode, setLinkMode] = useState(false);
  const [selectedAP, setSelectedAP] = useState(null);

  const [activeTab, setActiveTab] = useState("aps");
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  const [result, setResult] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const [constraintA, setConstraintA] = useState("");
  const [constraintB, setConstraintB] = useState("");

  const [newChannelId, setNewChannelId] = useState("");
  const [newChannelLabel, setNewChannelLabel] = useState("");
  const [newChannelColor, setNewChannelColor] = useState("#38bdf8");

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

  const channelMap = useMemo(() => {
    const map = new Map();
    channels.forEach((channel) => map.set(channel.id, channel));
    return map;
  }, [channels]);

  const progress =
    simulation && simulation.steps.length > 0
      ? Math.round((playIndex / simulation.steps.length) * 100)
      : 0;

  function clearResultAndSimulation() {
    setResult(null);
    setSimulation(null);
    setPlayIndex(0);
    setIsPlaying(false);
    setActiveStep(null);
  }

  function getScreenPosition(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function getWorldPosition(event) {
    const screen = getScreenPosition(event);

    return {
      x: (screen.x - viewport.x) / viewport.scale,
      y: (screen.y - viewport.y) / viewport.scale,
    };
  }

  function getChannelColor(channelId) {
    return channelMap.get(channelId)?.color || "#94a3b8";
  }

  function getChannelLabel(channelId) {
    return channelMap.get(channelId)?.label || `CH ${channelId}`;
  }

  function handleAddAP() {
    const nextId = aps.length > 0 ? Math.max(...aps.map((ap) => ap.id)) + 1 : 1;
    const fallbackChannel = channels[0]?.id ?? 1;

    const newAP = {
      id: nextId,
      name: `AP-${String(nextId).padStart(2, "0")}`,
      x: 110 + Math.random() * 520,
      y: 90 + Math.random() * 380,
      channel:
        channels[Math.floor(Math.random() * channels.length)]?.id ??
        fallbackChannel,
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

    const position = getWorldPosition(event);
    const nextId = aps.length > 0 ? Math.max(...aps.map((ap) => ap.id)) + 1 : 1;

    const newAP = {
      id: nextId,
      name: `AP-${String(nextId).padStart(2, "0")}`,
      x: position.x,
      y: position.y,
      channel: channels[Math.floor(Math.random() * channels.length)]?.id ?? 1,
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

  function handleCanvasMouseDown(event) {
    if (event.target.closest(".ap-node")) return;
    if (event.target.closest("button")) return;
    if (linkMode) return;

    setIsPanning(true);
    setPanStart({
      x: event.clientX - viewport.x,
      y: event.clientY - viewport.y,
    });
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

    const position = getWorldPosition(event);

    setDraggingAP(ap.id);
    setDragOffset({
      x: position.x - ap.x,
      y: position.y - ap.y,
    });
  }

  const handleMouseMove = useCallback(
    (event) => {
      if (draggingAP) {
        const position = getWorldPosition(event);

        setAps((prev) =>
          prev.map((ap) =>
            ap.id === draggingAP
              ? {
                  ...ap,
                  x: position.x - dragOffset.x,
                  y: position.y - dragOffset.y,
                }
              : ap
          )
        );

        return;
      }

      if (isPanning) {
        setViewport((prev) => ({
          ...prev,
          x: event.clientX - panStart.x,
          y: event.clientY - panStart.y,
        }));
      }
    },
    [draggingAP, dragOffset, isPanning, panStart, viewport]
  );

  function handleMouseUp() {
    if (draggingAP) {
      clearResultAndSimulation();
    }

    setDraggingAP(null);
    setIsPanning(false);
  }

  function handleWheel(event) {
    event.preventDefault();

    const screen = getScreenPosition(event);
    const worldBefore = {
      x: (screen.x - viewport.x) / viewport.scale,
      y: (screen.y - viewport.y) / viewport.scale,
    };

    const direction = event.deltaY > 0 ? -1 : 1;
    const factor = direction > 0 ? 1.12 : 0.88;

    const nextScale = Math.min(2.4, Math.max(0.35, viewport.scale * factor));

    setViewport({
      scale: nextScale,
      x: screen.x - worldBefore.x * nextScale,
      y: screen.y - worldBefore.y * nextScale,
    });
  }

  function handleZoomIn() {
    setViewport((prev) => ({
      ...prev,
      scale: Math.min(2.4, prev.scale + 0.15),
    }));
  }

  function handleZoomOut() {
    setViewport((prev) => ({
      ...prev,
      scale: Math.max(0.35, prev.scale - 0.15),
    }));
  }

  function handleResetView() {
    setViewport({ x: 0, y: 0, scale: 1 });
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

  function handleAddChannel() {
    const id = Number(newChannelId);

    if (!id) return;
    if (channels.some((channel) => channel.id === id)) return;

    const label = newChannelLabel.trim() || `CH ${id}`;

    setChannels((prev) => [
      ...prev,
      {
        id,
        label,
        color: newChannelColor,
      },
    ]);

    setNewChannelId("");
    setNewChannelLabel("");
    setNewChannelColor(
      DEFAULT_COLORS[(channels.length + 1) % DEFAULT_COLORS.length]
    );

    clearResultAndSimulation();
  }

  function handleUpdateChannel(id, field, value) {
    setChannels((prev) =>
      prev.map((channel) =>
        channel.id === id
          ? {
              ...channel,
              [field]: field === "id" ? Number(value) : value,
            }
          : channel
      )
    );
    clearResultAndSimulation();
  }

  function handleDeleteChannel(id) {
    if (channels.length <= 1) return;

    const remaining = channels.filter((channel) => channel.id !== id);
    const fallback = remaining[0].id;

    setChannels(remaining);
    setAps((prev) =>
      prev.map((ap) =>
        ap.channel === id ? { ...ap, channel: fallback } : ap
      )
    );

    clearResultAndSimulation();
  }

  function handleRandomize() {
    setAps((prev) =>
      prev.map((ap) => ({
        ...ap,
        channel:
          channels[Math.floor(Math.random() * channels.length)]?.id ??
          ap.channel,
      }))
    );

    clearResultAndSimulation();
  }

  function handleReset() {
    setChannels(INITIAL_CHANNELS.map((channel) => ({ ...channel })));
    setAps(cloneAps(INITIAL_APS));
    setLinks(INITIAL_LINKS.map((link) => [...link]));
    setSelectedAP(null);
    setLinkMode(false);
    setEditingId(null);
    setConstraintA("");
    setConstraintB("");
    setViewport({ x: 0, y: 0, scale: 1 });
    setResult(null);
    setSimulation(null);
    setPlayIndex(0);
    setIsPlaying(false);
    setActiveStep(null);
    setActiveTab("aps");
  }

  function handleStartSimulation() {
    const generated = buildMinConflictsSimulation(aps, links, channels, 1000);

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

  return (
    <div className={`app ${panelCollapsed ? "panel-collapsed" : ""}`}>
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
            <small>Canaux</small>
            <strong>{channels.length}</strong>
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

            <div className="zoom-tools">
              <button className="btn btn-small" onClick={handleZoomOut}>
                −
              </button>
              <span>{Math.round(viewport.scale * 100)}%</span>
              <button className="btn btn-small" onClick={handleZoomIn}>
                +
              </button>
              <button className="btn btn-small" onClick={handleResetView}>
                Centrer
              </button>
            </div>
          </div>

          <div
            ref={canvasRef}
            className={`canvas ${linkMode ? "canvas-linkmode" : ""} ${
              draggingAP ? "canvas-dragging" : ""
            } ${isPanning ? "canvas-panning" : ""}`}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClick}
          >
            <div
              className="canvas-world"
              style={{
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
              }}
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
                  const color = getChannelColor(ap.channel);
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
                          {getChannelLabel(ap.channel)}
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
          </div>

          <div className="canvas-hint">
            Double-clique pour ajouter un AP. Maintiens le clic gauche sur le
            fond pour déplacer l’espace. Utilise la molette ou les boutons pour
            zoomer/dézoomer.
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
                        color: getChannelColor(activeStep.previousChannel),
                      }}
                    >
                      {getChannelLabel(activeStep.previousChannel)}
                    </span>{" "}
                    → canal choisi :{" "}
                    <span
                      style={{
                        color: getChannelColor(activeStep.chosenChannel),
                      }}
                    >
                      {getChannelLabel(activeStep.chosenChannel)}
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
                        <span>{getChannelLabel(candidate.channel)}</span>
                        <strong>{candidate.score} conflit(s)</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="current-step">
                  <strong>État initial</strong>
                  <p>
                    La simulation va choisir un AP en conflit, tester les canaux,
                    puis appliquer le meilleur choix.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className={`side-panel ${panelCollapsed ? "side-hidden" : ""}`}>
          <button
            className="panel-toggle"
            onClick={() => setPanelCollapsed((prev) => !prev)}
            title={panelCollapsed ? "Afficher le menu" : "Réduire le menu"}
          >
            {panelCollapsed ? "☰" : "×"}
          </button>

          {!panelCollapsed && (
            <>
              <div className="tabs">
                <button
                  className={`tab ${activeTab === "aps" ? "tab-active" : ""}`}
                  onClick={() => setActiveTab("aps")}
                >
                  AP
                </button>

                <button
                  className={`tab ${
                    activeTab === "channels" ? "tab-active" : ""
                  }`}
                  onClick={() => setActiveTab("channels")}
                >
                  Canaux
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
                    {aps.map((ap) => {
                      const color = getChannelColor(ap.channel);
                      const hasConflict = conflictedIds.has(ap.id);

                      return (
                        <div
                          key={ap.id}
                          className={`ap-row ${
                            hasConflict ? "ap-row-conflict" : ""
                          }`}
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
                            {channels.map((channel) => (
                              <option key={channel.id} value={channel.id}>
                                {channel.label}
                              </option>
                            ))}
                          </select>

                          {hasConflict && (
                            <span className="conflict-badge">!</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeTab === "channels" && (
                  <div className="channels-panel">
                    <div className="channel-form">
                      <label>Ajouter un canal</label>

                      <input
                        type="number"
                        placeholder="Numéro du canal, ex: 3"
                        value={newChannelId}
                        onChange={(event) => setNewChannelId(event.target.value)}
                      />

                      <input
                        placeholder="Nom, ex: CH 3"
                        value={newChannelLabel}
                        onChange={(event) =>
                          setNewChannelLabel(event.target.value)
                        }
                      />

                      <input
                        type="color"
                        value={newChannelColor}
                        onChange={(event) =>
                          setNewChannelColor(event.target.value)
                        }
                      />

                      <button className="btn btn-full" onClick={handleAddChannel}>
                        Ajouter le canal
                      </button>
                    </div>

                    <div className="channel-list">
                      {channels.map((channel) => (
                        <div className="channel-row" key={channel.id}>
                          <span
                            className="channel-color"
                            style={{ background: channel.color }}
                          />

                          <div className="channel-edit">
                            <input
                              value={channel.label}
                              onChange={(event) =>
                                handleUpdateChannel(
                                  channel.id,
                                  "label",
                                  event.target.value
                                )
                              }
                            />

                            <small>Identifiant : {channel.id}</small>
                          </div>

                          <input
                            className="small-color-input"
                            type="color"
                            value={channel.color}
                            onChange={(event) =>
                              handleUpdateChannel(
                                channel.id,
                                "color",
                                event.target.value
                              )
                            }
                          />

                          <button
                            className="remove-link"
                            onClick={() => handleDeleteChannel(channel.id)}
                            disabled={channels.length <= 1}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === "constraints" && (
                  <div className="constraints-panel">
                    <div className="constraint-form">
                      <label>Ajouter une contrainte d’interférence</label>

                      <div className="constraint-inputs">
                        <select
                          value={constraintA}
                          onChange={(event) =>
                            setConstraintA(event.target.value)
                          }
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
                          onChange={(event) =>
                            setConstraintB(event.target.value)
                          }
                        >
                          <option value="">AP B</option>
                          {aps.map((ap) => (
                            <option key={ap.id} value={ap.id}>
                              {ap.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        className="btn btn-full"
                        onClick={handleAddConstraint}
                      >
                        Ajouter la contrainte
                      </button>
                    </div>

                    <div className="constraint-list">
                      {links.map(([a, b]) => {
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
                      })}
                    </div>
                  </div>
                )}

                {activeTab === "simulation" && (
                  <div className="result-panel">
                    {!simulation ? (
                      <div className="result-empty">
                        <strong>Aucune simulation lancée</strong>
                        <p>
                          Clique sur “Lancer la simulation” pour voir les choix
                          de l’algorithme étape par étape.
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
                              className={
                                conflicts === 0 ? "metric-good" : "metric-bad"
                              }
                            >
                              {conflicts}
                            </strong>
                          </div>

                          <div className="result-metric">
                            <span>Progression</span>
                            <strong className="metric-neutral">
                              {progress}%
                            </strong>
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
                              result.success
                                ? "status-success"
                                : "status-warning"
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
                                <span className="log-iter">
                                  #{step.iteration}
                                </span>

                                <span className="log-name">{step.apName}</span>

                                <span
                                  className="log-ch"
                                  style={{
                                    color: getChannelColor(step.chosenChannel),
                                  }}
                                >
                                  {getChannelLabel(step.previousChannel)} →{" "}
                                  {getChannelLabel(step.chosenChannel)}
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
                        <strong>Canaux configurables dynamiquement</strong>
                      </div>

                      <div className="info-row">
                        <span>Contraintes</span>
                        <strong>
                          Deux AP reliés ne doivent pas avoir le même canal
                        </strong>
                      </div>

                      <div className="info-row">
                        <span>Objectif</span>
                        <strong>Minimiser le nombre total de conflits</strong>
                      </div>
                    </section>

                    <section>
                      <h3>Navigation éditeur</h3>

                      <ol className="info-steps">
                        <li>Molette : zoomer ou dézoomer.</li>
                        <li>Clic maintenu sur le fond : déplacer l’espace.</li>
                        <li>Clic maintenu sur un AP : déplacer l’AP.</li>
                        <li>Double-clic sur le fond : ajouter un AP.</li>
                        <li>Mode contrainte : relier deux AP.</li>
                      </ol>
                    </section>
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}