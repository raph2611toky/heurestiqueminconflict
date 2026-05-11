import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const MIN_CHANNEL_GAP = 5;
const CHANNEL_WIDTH_MHZ = "20–22 MHz";
const CHANNEL_SPACING_MHZ = "5 MHz";

const CHANNELS = [
  { id: 1, label: "CH 1", color: "#00e5ff" },
  { id: 2, label: "CH 2", color: "#38bdf8" },
  { id: 3, label: "CH 3", color: "#60a5fa" },
  { id: 4, label: "CH 4", color: "#818cf8" },
  { id: 5, label: "CH 5", color: "#a78bfa" },
  { id: 6, label: "CH 6", color: "#69ff47" },
  { id: 7, label: "CH 7", color: "#34d399" },
  { id: 8, label: "CH 8", color: "#fbbf24" },
  { id: 9, label: "CH 9", color: "#fb923c" },
  { id: 10, label: "CH 10", color: "#fb7185" },
  { id: 11, label: "CH 11", color: "#ff6b35" },
];

const DEFAULT_1_APS = [
  { id: 1, name: "AP-01", x: 160, y: 140, channel: 1 },
  { id: 2, name: "AP-02", x: 390, y: 120, channel: 6 },
  { id: 3, name: "AP-03", x: 620, y: 210, channel: 11 },
  { id: 4, name: "AP-04", x: 300, y: 360, channel: 6 },
  { id: 5, name: "AP-05", x: 540, y: 430, channel: 11 },
];

const DEFAULT_1_LINKS = [
  [1, 2],
  [2, 3],
  [2, 4],
  [3, 5],
  [4, 5],
];

function createDefaultTwoNetwork() {
  const aps = [
    { id: 1, name: "AP-01", x: 120, y: 100, channel: 1 },
    { id: 2, name: "AP-02", x: 300, y: 95, channel: 1 },
    { id: 3, name: "AP-03", x: 480, y: 110, channel: 6 },
    { id: 4, name: "AP-04", x: 660, y: 95, channel: 6 },
    { id: 5, name: "AP-05", x: 840, y: 110, channel: 3 },

    { id: 6, name: "AP-06", x: 150, y: 260, channel: 5 },
    { id: 7, name: "AP-07", x: 330, y: 250, channel: 8 },
    { id: 8, name: "AP-08", x: 510, y: 265, channel: 10 },
    { id: 9, name: "AP-09", x: 690, y: 250, channel: 11 },
    { id: 10, name: "AP-10", x: 870, y: 265, channel: 11 },

    { id: 11, name: "AP-11", x: 120, y: 420, channel: 2 },
    { id: 12, name: "AP-12", x: 300, y: 415, channel: 7 },
    { id: 13, name: "AP-13", x: 480, y: 430, channel: 4 },
    { id: 14, name: "AP-14", x: 660, y: 415, channel: 9 },
    { id: 15, name: "AP-15", x: 840, y: 430, channel: 5 },

    { id: 16, name: "AP-16", x: 150, y: 580, channel: 1 },
    { id: 17, name: "AP-17", x: 330, y: 570, channel: 6 },
    { id: 18, name: "AP-18", x: 510, y: 585, channel: 11 },
    { id: 19, name: "AP-19", x: 690, y: 570, channel: 3 },
    { id: 20, name: "AP-20", x: 870, y: 585, channel: 8 },
  ];

  const links = [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],

    [1, 6],
    [2, 7],
    [3, 8],
    [4, 9],
    [5, 10],

    [6, 11],
    [7, 12],
    [8, 13],
    [9, 14],
    [10, 15],

    [11, 16],
    [12, 17],
    [13, 18],
    [14, 19],
    [15, 20],

    [1, 7],
    [2, 8],
    [3, 9],
    [4, 10],
    [6, 12],
    [7, 13],
    [8, 14],
    [9, 15],
    [11, 17],
    [12, 18],
    [13, 19],
    [14, 20],
  ];

  return { aps, links };
}

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

function getChannelColor(channelId) {
  return (
    CHANNELS.find((channel) => channel.id === Number(channelId))?.color ||
    "#94a3b8"
  );
}

function getChannelLabel(channelId) {
  return (
    CHANNELS.find((channel) => channel.id === Number(channelId))?.label ||
    `CH ${channelId}`
  );
}

function getLinkConflict(apA, apB) {
  if (!apA || !apB) {
    return {
      hasConflict: false,
      type: "none",
      label: "Aucun conflit",
      penalty: 0,
      difference: null,
    };
  }

  const difference = Math.abs(Number(apA.channel) - Number(apB.channel));

  if (difference === 0) {
    return {
      hasConflict: true,
      type: "same",
      label: "Conflit direct : même canal",
      penalty: 10,
      difference,
    };
  }

  if (difference < MIN_CHANNEL_GAP) {
    return {
      hasConflict: true,
      type: "close",
      label: `Conflit moyen : canaux proches`,
      penalty: MIN_CHANNEL_GAP - difference,
      difference,
    };
  }

  return {
    hasConflict: false,
    type: "ok",
    label: `Correct : écart ${difference}`,
    penalty: 0,
    difference,
  };
}

function analyzeLinks(aps, links) {
  return links.map(([a, b]) => {
    const apA = aps.find((ap) => ap.id === a);
    const apB = aps.find((ap) => ap.id === b);
    const conflict = getLinkConflict(apA, apB);

    return {
      a,
      b,
      apA,
      apB,
      ...conflict,
    };
  });
}

function countConflicts(aps, links) {
  return analyzeLinks(aps, links).filter((link) => link.hasConflict).length;
}

function totalPenalty(aps, links) {
  return analyzeLinks(aps, links).reduce(
    (sum, link) => sum + link.penalty,
    0
  );
}

function getConflictedAPIds(aps, links) {
  const ids = new Set();

  for (const link of analyzeLinks(aps, links)) {
    if (link.hasConflict) {
      ids.add(link.a);
      ids.add(link.b);
    }
  }

  return Array.from(ids);
}

function getAPConflictLevels(aps, links) {
  const levels = new Map();

  for (const link of analyzeLinks(aps, links)) {
    if (!link.hasConflict) continue;

    for (const apId of [link.a, link.b]) {
      const previous = levels.get(apId);

      if (link.type === "same") {
        levels.set(apId, "same");
      } else if (!previous) {
        levels.set(apId, "close");
      }
    }
  }

  return levels;
}

function conflictScoreForChannel(apId, channel, aps, links) {
  let conflictCount = 0;
  let penalty = 0;
  const details = [];

  for (const [a, b] of links) {
    if (a !== apId && b !== apId) continue;

    const neighborId = a === apId ? b : a;
    const neighbor = aps.find((ap) => ap.id === neighborId);
    const simulatedAP = { id: apId, channel };
    const result = getLinkConflict(simulatedAP, neighbor);

    if (result.hasConflict) {
      conflictCount++;
      penalty += result.penalty;
    }

    details.push({
      neighborId,
      neighborName: neighbor?.name || `AP-${neighborId}`,
      neighborChannel: neighbor?.channel,
      ...result,
    });
  }

  return {
    channel,
    conflictCount,
    penalty,
    details,
  };
}

function buildMinConflictsSimulation(aps, links, maxIterations = 200) {
  let current = cloneAps(aps);

  const initialAps = cloneAps(aps);
  const beforeConflicts = countConflicts(current, links);
  const beforePenalty = totalPenalty(current, links);
  const steps = [];

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const conflictsBefore = countConflicts(current, links);
    const penaltyBefore = totalPenalty(current, links);

    if (conflictsBefore === 0) break;

    const conflictedIds = getConflictedAPIds(current, links);
    if (conflictedIds.length === 0) break;

    const selectedId =
      conflictedIds[Math.floor(Math.random() * conflictedIds.length)];

    const selectedBefore = current.find((ap) => ap.id === selectedId);

    const candidates = CHANNELS.map((channel) =>
      conflictScoreForChannel(selectedId, channel.id, current, links)
    );

    const minPenalty = Math.min(
      ...candidates.map((candidate) => candidate.penalty)
    );

    let bestCandidates = candidates.filter(
      (candidate) => candidate.penalty === minPenalty
    );

    if (bestCandidates.length > 1 && selectedBefore) {
      const differentFromCurrent = bestCandidates.filter(
        (candidate) => candidate.channel !== selectedBefore.channel
      );

      if (differentFromCurrent.length > 0) {
        bestCandidates = differentFromCurrent;
      }
    }

    const chosenCandidate =
      bestCandidates[Math.floor(Math.random() * bestCandidates.length)];

    const chosenChannel = chosenCandidate.channel;

    const afterAps = current.map((ap) =>
      ap.id === selectedId ? { ...ap, channel: chosenChannel } : ap
    );

    const conflictsAfter = countConflicts(afterAps, links);
    const penaltyAfter = totalPenalty(afterAps, links);

    steps.push({
      iteration,
      apId: selectedId,
      apName: selectedBefore?.name || `AP-${selectedId}`,
      previousChannel: selectedBefore?.channel,
      chosenChannel,
      candidates,
      chosenCandidate,
      conflictsBefore,
      conflictsAfter,
      penaltyBefore,
      penaltyAfter,
      afterAps: cloneAps(afterAps),
    });

    current = afterAps;
  }

  const afterConflicts = countConflicts(current, links);
  const afterPenalty = totalPenalty(current, links);

  return {
    initialAps,
    steps,
    summary: {
      before: beforeConflicts,
      after: afterConflicts,
      penaltyBefore: beforePenalty,
      penaltyAfter: afterPenalty,
      iterations: steps.length,
      success: afterConflicts === 0,
      history: steps,
      solution: cloneAps(current),
    },
  };
}

export default function App() {
  const canvasRef = useRef(null);

  const [aps, setAps] = useState(cloneAps(DEFAULT_1_APS));
  const [links, setLinks] = useState(DEFAULT_1_LINKS.map((link) => [...link]));

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
  const [channelMenu, setChannelMenu] = useState(null);

  const [constraintA, setConstraintA] = useState("");
  const [constraintB, setConstraintB] = useState("");

  const [simulation, setSimulation] = useState(null);
  const [playIndex, setPlayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeStep, setActiveStep] = useState(null);
  const [simulationSpeed, setSimulationSpeed] = useState(1000);

  const linkAnalysis = useMemo(() => analyzeLinks(aps, links), [aps, links]);
  const conflicts = useMemo(() => countConflicts(aps, links), [aps, links]);
  const penalty = useMemo(() => totalPenalty(aps, links), [aps, links]);

  const apConflictLevels = useMemo(
    () => getAPConflictLevels(aps, links),
    [aps, links]
  );

  const conflictedIds = useMemo(
    () => new Set(Array.from(apConflictLevels.keys())),
    [apConflictLevels]
  );

  const visibleLogs = useMemo(() => {
    if (!simulation) return [];
    return simulation.steps.slice(0, playIndex);
  }, [simulation, playIndex]);

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

  function clearAllRuntimeStates() {
    setSelectedAP(null);
    setLinkMode(false);
    setEditingId(null);
    setChannelMenu(null);
    setConstraintA("");
    setConstraintB("");
    setResult(null);
    setSimulation(null);
    setPlayIndex(0);
    setIsPlaying(false);
    setActiveStep(null);
    setActiveTab("aps");
  }

  function loadDefaultOne() {
    setAps(cloneAps(DEFAULT_1_APS));
    setLinks(DEFAULT_1_LINKS.map((link) => [...link]));
    setViewport({ x: 0, y: 0, scale: 1 });
    clearAllRuntimeStates();
  }

  function loadDefaultTwo() {
    const complex = createDefaultTwoNetwork();

    setAps(cloneAps(complex.aps));
    setLinks(complex.links.map((link) => [...link]));
    setViewport({ x: -40, y: -20, scale: 0.75 });
    clearAllRuntimeStates();
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

  const handleWheel = useCallback(
    (event) => {
      event.preventDefault();

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const screen = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      const worldBefore = {
        x: (screen.x - viewport.x) / viewport.scale,
        y: (screen.y - viewport.y) / viewport.scale,
      };

      const factor = event.deltaY > 0 ? 0.88 : 1.12;
      const nextScale = Math.min(2.4, Math.max(0.35, viewport.scale * factor));

      setViewport({
        scale: nextScale,
        x: screen.x - worldBefore.x * nextScale,
        y: screen.y - worldBefore.y * nextScale,
      });
    },
    [viewport]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  function handleAddAP() {
    const nextId = aps.length > 0 ? Math.max(...aps.map((ap) => ap.id)) + 1 : 1;

    const newAP = {
      id: nextId,
      name: `AP-${String(nextId).padStart(2, "0")}`,
      x: 120 + Math.random() * 560,
      y: 90 + Math.random() * 420,
      channel: CHANNELS[Math.floor(Math.random() * CHANNELS.length)].id,
    };

    setAps((prev) => [...prev, newAP]);
    setChannelMenu(null);
    clearResultAndSimulation();
  }

  function handleDoubleClick(event) {
    if (event.target.closest(".ap-node")) return;

    const position = getWorldPosition(event);
    const nextId = aps.length > 0 ? Math.max(...aps.map((ap) => ap.id)) + 1 : 1;

    const newAP = {
      id: nextId,
      name: `AP-${String(nextId).padStart(2, "0")}`,
      x: position.x,
      y: position.y,
      channel: CHANNELS[Math.floor(Math.random() * CHANNELS.length)].id,
    };

    setAps((prev) => [...prev, newAP]);
    setChannelMenu(null);
    clearResultAndSimulation();
  }

  function handleDeleteAP(id) {
    setAps((prev) => prev.filter((ap) => ap.id !== id));
    setLinks((prev) => prev.filter(([a, b]) => a !== id && b !== id));
    setSelectedAP(null);
    setEditingId(null);
    setChannelMenu(null);
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

    setChannelMenu(null);
    clearResultAndSimulation();
  }

  function handleAPDoubleClick(event, ap) {
    event.stopPropagation();

    setChannelMenu((prev) => {
      if (prev?.apId === ap.id) {
        return null;
      }

      return {
        apId: ap.id,
        x: ap.x,
        y: ap.y,
      };
    });
  }

  function handleCanvasMouseDown(event) {
    setChannelMenu(null);

    if (event.target.closest(".ap-node")) return;
    if (event.target.closest("button")) return;
    if (event.target.closest("select")) return;
    if (event.target.closest(".channel-floating-menu")) return;
    if (linkMode) return;

    setIsPanning(true);
    setPanStart({
      x: event.clientX - viewport.x,
      y: event.clientY - viewport.y,
    });
  }

  function handleAPMouseDown(event, ap) {
    event.stopPropagation();

    if (
      event.target.closest("button") ||
      event.target.closest("input") ||
      event.target.closest("select") ||
      event.target.closest(".channel-floating-menu")
    ) {
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
    setChannelMenu(null);
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
    setChannelMenu(null);
  }

  function handleRemoveConstraint(a, b) {
    setLinks((prev) => prev.filter((link) => !sameLink(link, a, b)));
    setChannelMenu(null);
    clearResultAndSimulation();
  }

  function handleRandomize() {
    setAps((prev) =>
      prev.map((ap) => ({
        ...ap,
        channel: CHANNELS[Math.floor(Math.random() * CHANNELS.length)].id,
      }))
    );

    setChannelMenu(null);
    clearResultAndSimulation();
  }

  function handleReset() {
    loadDefaultOne();
  }

  function handleStartSimulation() {
    setChannelMenu(null);

    const generated = buildMinConflictsSimulation(aps, links, 200);

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
      setResult(null);
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

  function getAPName(id) {
    return aps.find((ap) => ap.id === id)?.name || `AP-${id}`;
  }

  function getLinkClass(link) {
    if (!link.hasConflict) return "link link-ok";
    if (link.type === "same") return "link link-conflict-strong";
    return "link link-conflict-close";
  }

  function getConstraintStatusText(link) {
    if (!link.hasConflict) {
      return `Correct : écart ${link.difference} canal(aux)`;
    }

    if (link.type === "same") {
      return "Conflit direct : même canal";
    }

    return `Conflit moyen : écart ${link.difference} < ${MIN_CHANNEL_GAP}`;
  }

  const currentChannelMenuAP = channelMenu
    ? aps.find((ap) => ap.id === channelMenu.apId)
    : null;

  return (
    <div className={`app ${panelCollapsed ? "panel-collapsed" : ""}`}>
      <header className="header">
        <div className="header-left">
          <div className="header-badge">Min-Conflicts · Réseaux Wi-Fi</div>

          <h1 className="header-title">
            <span>Wi-Fi</span> Channel Optimizer
          </h1>

          <p className="header-subtitle">
            Simulation d’attribution des canaux Wi-Fi CH 1 à CH 11 avec
            détection des conflits directs et des conflits moyens d’interférence.
          </p>
        </div>

        <div className="header-stats">
          <div
            className={`stat-box ${conflicts === 0 ? "stat-ok" : "stat-bad"}`}
          >
            <small>Conflits</small>
            <strong>{conflicts}</strong>
          </div>

          <div className={`stat-box ${penalty === 0 ? "stat-ok" : "stat-bad"}`}>
            <small>Score</small>
            <strong>{penalty}</strong>
          </div>

          <div className="stat-box">
            <small>Canaux</small>
            <strong>1–11</strong>
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
                setChannelMenu(null);
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

            <div className="preset-tools">
              <button className="btn btn-small" onClick={loadDefaultOne}>
                Défaut 1
              </button>

              <button
                className="btn btn-small btn-complex"
                onClick={loadDefaultTwo}
              >
                Défaut 2
              </button>
            </div>

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
                  {linkAnalysis.map((link) => {
                    const { a, b, apA, apB } = link;

                    if (!apA || !apB) return null;

                    const isActiveLink =
                      activeStep &&
                      (activeStep.apId === a || activeStep.apId === b) &&
                      link.hasConflict;

                    return (
                      <g key={`${a}-${b}`}>
                        {link.hasConflict && (
                          <line
                            x1={apA.x}
                            y1={apA.y}
                            x2={apB.x}
                            y2={apB.y}
                            className={
                              link.type === "same"
                                ? "link-glow-conflict-strong"
                                : "link-glow-conflict-close"
                            }
                          />
                        )}

                        <line
                          x1={apA.x}
                          y1={apA.y}
                          x2={apB.x}
                          y2={apB.y}
                          className={`${getLinkClass(link)} ${
                            isActiveLink ? "link-active-step" : ""
                          }`}
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
                  const conflictLevel = apConflictLevels.get(ap.id);
                  const hasConflict = conflictedIds.has(ap.id);
                  const isActiveSimulationAP = activeStep?.apId === ap.id;

                  return (
                    <div
                      key={ap.id}
                      className={[
                        "ap-node",
                        selectedAP === ap.id ? "ap-selected" : "",
                        conflictLevel === "same" ? "ap-conflict-strong" : "",
                        conflictLevel === "close" ? "ap-conflict-close" : "",
                        !hasConflict ? "ap-ok" : "",
                        isActiveSimulationAP ? "ap-simulation-active" : "",
                        channelMenu?.apId === ap.id ? "ap-channel-open" : "",
                      ].join(" ")}
                      style={{
                        left: ap.x,
                        top: ap.y,
                        "--ch-color": color,
                      }}
                      onMouseDown={(event) => handleAPMouseDown(event, ap)}
                      onDoubleClick={(event) => handleAPDoubleClick(event, ap)}
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

                      {hasConflict && (
                        <div
                          className={`ap-alert ${
                            conflictLevel === "same"
                              ? "ap-alert-strong"
                              : "ap-alert-close"
                          }`}
                        >
                          {conflictLevel === "same" ? "!" : "~"}
                        </div>
                      )}

                      {isActiveSimulationAP && (
                        <div className="simulation-badge">choisi</div>
                      )}
                    </div>
                  );
                })}

                {channelMenu && currentChannelMenuAP && (
                  <div
                    className="channel-floating-menu"
                    style={{
                      left: channelMenu.x + 58,
                      top: channelMenu.y - 42,
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    <div className="channel-floating-title">
                      {currentChannelMenuAP.name} · choisir un canal
                    </div>

                    <div className="channel-floating-grid">
                      {CHANNELS.map((channel) => (
                        <button
                          key={channel.id}
                          className={`channel-floating-option ${
                            currentChannelMenuAP.channel === channel.id
                              ? "channel-floating-active"
                              : ""
                          }`}
                          style={{ "--ch-color": channel.color }}
                          onClick={() =>
                            handleChannelChange(channelMenu.apId, channel.id)
                          }
                        >
                          {channel.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="canvas-hint">
            Rouge : conflit direct avec le même canal. Orange : conflit moyen
            causé par des canaux trop proches. Double-clique sur un AP pour
            modifier rapidement son canal.
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
                  <option value={1500}>Très lent</option>
                  <option value={1000}>Normal</option>
                  <option value={550}>Rapide</option>
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
                    hasard parmi les AP en conflit
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

                  <p>
                    Score avant : {activeStep.penaltyBefore} → score après :{" "}
                    {activeStep.penaltyAfter}
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
                        <strong>{candidate.penalty} score</strong>
                        <small>{candidate.conflictCount} conflit(s)</small>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="current-step">
                  <strong>État initial</strong>
                  <p>
                    La simulation va détecter les conflits, choisir un AP en
                    conflit, tester les 11 canaux, puis garder celui qui donne le
                    plus petit score.
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
                      const conflictLevel = apConflictLevels.get(ap.id);

                      return (
                        <div
                          key={ap.id}
                          className={`ap-row ${
                            conflictLevel === "same"
                              ? "ap-row-conflict-strong"
                              : conflictLevel === "close"
                              ? "ap-row-conflict-close"
                              : ""
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
                            {CHANNELS.map((channel) => (
                              <option key={channel.id} value={channel.id}>
                                {channel.label}
                              </option>
                            ))}
                          </select>

                          {conflictLevel && (
                            <span
                              className={`conflict-badge ${
                                conflictLevel === "same"
                                  ? "conflict-badge-strong"
                                  : "conflict-badge-close"
                              }`}
                            >
                              {conflictLevel === "same" ? "!" : "~"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeTab === "channels" && (
                  <div className="channels-panel">
                    <div className="channel-info-card">
                      <strong>Canaux disponibles</strong>
                      <p>
                        Les canaux sont fixés de CH 1 à CH 11. Chaque canal est
                        séparé de {CHANNEL_SPACING_MHZ}, mais un signal Wi-Fi
                        occupe environ {CHANNEL_WIDTH_MHZ}. Donc deux canaux
                        trop proches peuvent se chevaucher.
                      </p>
                    </div>

                    <div className="channel-list">
                      {CHANNELS.map((channel) => (
                        <div className="channel-row" key={channel.id}>
                          <span
                            className="channel-color"
                            style={{ background: channel.color }}
                          />

                          <div className="channel-edit">
                            <strong>{channel.label}</strong>
                            <small>Canal n° {channel.id}</small>
                          </div>
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
                      {linkAnalysis.map((link) => (
                        <div
                          className={`constraint-row ${
                            link.type === "same"
                              ? "constraint-conflict-strong"
                              : link.type === "close"
                              ? "constraint-conflict-close"
                              : ""
                          }`}
                          key={`${link.a}-${link.b}`}
                        >
                          <div>
                            <strong>
                              {getAPName(link.a)} ↔ {getAPName(link.b)}
                            </strong>
                            <small>{getConstraintStatusText(link)}</small>
                          </div>

                          <button
                            className="remove-link"
                            onClick={() =>
                              handleRemoveConstraint(link.a, link.b)
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
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
                            <span>Score actuel</span>
                            <strong
                              className={
                                penalty === 0 ? "metric-good" : "metric-bad"
                              }
                            >
                              {penalty}
                            </strong>
                          </div>

                          <div className="result-metric">
                            <span>Progression</span>
                            <strong className="metric-neutral">
                              {progress}%
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
                                  score {step.penaltyAfter}
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
                      <h3>Règle de conflit</h3>

                      <div className="info-row">
                        <span>Rouge</span>
                        <strong>Conflit direct : même canal</strong>
                      </div>

                      <div className="info-row">
                        <span>Orange</span>
                        <strong>
                          Conflit moyen : canaux proches, écart inférieur à{" "}
                          {MIN_CHANNEL_GAP}
                        </strong>
                      </div>

                      <div className="info-row">
                        <span>Correct</span>
                        <strong>
                          Deux AP voisins sont corrects si l’écart est au moins{" "}
                          {MIN_CHANNEL_GAP}
                        </strong>
                      </div>
                    </section>

                    <section>
                      <h3>Pourquoi ?</h3>

                      <ol className="info-steps">
                        <li>Les canaux 2,4 GHz sont espacés de 5 MHz.</li>
                        <li>Un signal Wi-Fi occupe environ 20 à 22 MHz.</li>
                        <li>
                          Deux canaux proches se chevauchent donc en fréquence.
                        </li>
                        <li>
                          Min-Conflicts choisit le canal qui réduit le score de
                          conflit.
                        </li>
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