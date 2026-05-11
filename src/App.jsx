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
  { id: 4, name: "AP-04", x: 300, y: 360, channel: 1 },
  { id: 5, name: "AP-05", x: 540, y: 430, channel: 6 },
];

const DEFAULT_1_LINKS = [
  [1, 2],
  [2, 3],
  [2, 4],
  [3, 5],
  [4, 5],
];

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return min;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function makeLinkKey(a, b) {
  const [x, y] = normalizeLink(a, b);
  return `${x}-${y}`;
}

function channelsConflict(channelA, channelB) {
  return Math.abs(Number(channelA) - Number(channelB)) < MIN_CHANNEL_GAP;
}

function createGeneratedNetwork(apCountInput) {
  const apCount = clampNumber(apCountInput, 2, 60);
  // Randomise conflicts between 3 and 10
  const conflictTarget = Math.floor(Math.random() * 8) + 3;
  const maxLinks = (apCount * (apCount - 1)) / 2;
  const safeChannels = [1, 6, 11];

  // --- Scatter APs using a phyllotaxis (sunflower) spiral so they are
  //     naturally spread, never aligned, and well-spaced. ---
  const centerX = 860;
  const centerY = 520;
  const goldenAngle = 2.399963; // radians ≈ 137.5°
  // Spacing grows with count so the cloud stays visible
  const spacing = Math.max(120, Math.min(200, 600 / Math.sqrt(apCount)));

  const aps = Array.from({ length: apCount }, (_, index) => {
    const id = index + 1;
    const r = spacing * Math.sqrt(index + 0.5);
    const theta = goldenAngle * index;
    // Small random jitter so no two runs look identical
    const jitter = spacing * 0.18;
    return {
      id,
      name: `AP-${String(id).padStart(2, "0")}`,
      x: Math.round(centerX + r * Math.cos(theta) + (Math.random() * jitter - jitter / 2)),
      y: Math.round(centerY + r * Math.sin(theta) + (Math.random() * jitter - jitter / 2)),
      channel: safeChannels[index % safeChannels.length],
    };
  });

  const links = [];
  const used = new Set();

  function addLink(a, b) {
    if (a === b) return false;
    const [x, y] = normalizeLink(a, b);
    const key = makeLinkKey(x, y);
    if (used.has(key)) return false;
    used.add(key);
    links.push([x, y]);
    return true;
  }

  // --- Build a Euclidean-distance spanning tree (Prim's algorithm) so the
  //     base connectivity is planar-ish and links don't criss-cross randomly ---
  function dist(a, b) {
    return Math.hypot(aps[a - 1].x - aps[b - 1].x, aps[a - 1].y - aps[b - 1].y);
  }

  const inTree = new Set([1]);
  while (inTree.size < apCount) {
    let bestDist = Infinity;
    let bestA = -1, bestB = -1;
    for (const a of inTree) {
      for (let b = 1; b <= apCount; b++) {
        if (inTree.has(b)) continue;
        const d = dist(a, b);
        if (d < bestDist) { bestDist = d; bestA = a; bestB = b; }
      }
    }
    if (bestA === -1) break;
    addLink(bestA, bestB);
    inTree.add(bestB);
  }

  // --- Add a few extra "nearby" links for realism (at most apCount/2 extra) ---
  // Sort all candidate pairs by distance
  const candidates = [];
  for (let i = 1; i <= apCount; i++) {
    for (let j = i + 1; j <= apCount; j++) {
      const key = makeLinkKey(i, j);
      if (!used.has(key)) candidates.push({ a: i, b: j, d: dist(i, j) });
    }
  }
  candidates.sort((x, y) => x.d - y.d);
  const extraTarget = Math.min(Math.floor(apCount / 2), candidates.length);
  for (let k = 0; k < extraTarget; k++) {
    addLink(candidates[k].a, candidates[k].b);
  }

  // --- Inject conflicts: force conflicting channels on `conflictTarget` links ---
  // Pick links at random to become conflict links
  const shuffled = [...links].sort(() => Math.random() - 0.5);
  const clampedConflicts = Math.min(conflictTarget, Math.min(maxLinks, links.length));
  for (let k = 0; k < clampedConflicts; k++) {
    const [a, b] = shuffled[k];
    aps[a - 1].channel = 1;
    aps[b - 1].channel = 1;
  }

  // --- Auto-scale viewport so the whole cloud fits the canvas (2200×1600) ---
  const xs = aps.map(ap => ap.x);
  const ys = aps.map(ap => ap.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const cloudW = maxX - minX + 200;
  const cloudH = maxY - minY + 200;
  const scale = Math.min(1, Math.min(1800 / cloudW, 1200 / cloudH));

  return {
    aps,
    links,
    viewport: { x: 0, y: 0, scale },
  };
}

function createAdditiveGeneratedNetwork(existingAps, existingLinks, apCountInput) {
  const addCount = clampNumber(apCountInput, 1, 40);
  const safeChannels = [1, 6, 11];
  const currentAps = cloneAps(existingAps);
  const currentLinks = existingLinks.map((link) => [...link]);
  const nextStartId = currentAps.length > 0 ? Math.max(...currentAps.map((ap) => ap.id)) + 1 : 1;

  const xs = currentAps.map((ap) => ap.x);
  const ys = currentAps.map((ap) => ap.y);

  const baseCenterX = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 860;
  const baseCenterY = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 520;
  const baseW = xs.length ? Math.max(...xs) - Math.min(...xs) : 520;
  const baseH = ys.length ? Math.max(...ys) - Math.min(...ys) : 360;

  const goldenAngle = 2.399963;
  const spacing = Math.max(135, Math.min(220, 650 / Math.sqrt(Math.max(addCount, 1))));
  const startRadius = Math.max(180, Math.min(520, Math.max(baseW, baseH) / 2 + 120));

  const addedAps = Array.from({ length: addCount }, (_, index) => {
    const id = nextStartId + index;
    const theta = goldenAngle * (index + currentAps.length);
    const r = startRadius + spacing * Math.sqrt(index + 0.5);
    const jitter = spacing * 0.2;

    return {
      id,
      name: `AP-${String(id).padStart(2, "0")}`,
      x: Math.round(baseCenterX + r * Math.cos(theta) + (Math.random() * jitter - jitter / 2)),
      y: Math.round(baseCenterY + r * Math.sin(theta) + (Math.random() * jitter - jitter / 2)),
      channel: safeChannels[index % safeChannels.length],
    };
  });

  const combinedAps = [...currentAps, ...addedAps];
  const links = [...currentLinks];
  const used = new Set(links.map(([a, b]) => makeLinkKey(a, b)));

  function addLink(a, b) {
    if (a === b) return false;
    const [x, y] = normalizeLink(a, b);
    const key = makeLinkKey(x, y);
    if (used.has(key)) return false;
    used.add(key);
    links.push([x, y]);
    return true;
  }

  function distById(aId, bId) {
    const a = combinedAps.find((ap) => ap.id === aId);
    const b = combinedAps.find((ap) => ap.id === bId);
    if (!a || !b) return Infinity;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  const allIdsBeforeAdd = currentAps.map((ap) => ap.id);
  const newIds = addedAps.map((ap) => ap.id);

  for (const newId of newIds) {
    const candidates = combinedAps
      .filter((ap) => ap.id !== newId)
      .map((ap) => ({ id: ap.id, d: distById(newId, ap.id) }))
      .sort((a, b) => a.d - b.d);

    if (candidates[0]) addLink(newId, candidates[0].id);
    if (candidates[1] && Math.random() < 0.65) addLink(newId, candidates[1].id);
  }

  const nearbyPairs = [];
  for (let i = 0; i < combinedAps.length; i++) {
    for (let j = i + 1; j < combinedAps.length; j++) {
      const a = combinedAps[i].id;
      const b = combinedAps[j].id;
      if (!newIds.includes(a) && !newIds.includes(b)) continue;
      if (used.has(makeLinkKey(a, b))) continue;
      nearbyPairs.push({ a, b, d: distById(a, b) });
    }
  }

  nearbyPairs.sort((a, b) => a.d - b.d);
  const extraTarget = Math.min(Math.ceil(addCount / 2), nearbyPairs.length);
  for (let i = 0; i < extraTarget; i++) addLink(nearbyPairs[i].a, nearbyPairs[i].b);

  const randomConflictTarget = Math.floor(Math.random() * 8) + 3;
  const newRelatedLinks = links.filter(([a, b]) => newIds.includes(a) || newIds.includes(b));
  const shuffledConflictLinks = [...newRelatedLinks].sort(() => Math.random() - 0.5);
  const maxPossibleConflicts = Math.min(randomConflictTarget, shuffledConflictLinks.length);

  for (let i = 0; i < maxPossibleConflicts; i++) {
    const [a, b] = shuffledConflictLinks[i];
    const apA = combinedAps.find((ap) => ap.id === a);
    const apB = combinedAps.find((ap) => ap.id === b);
    if (!apA || !apB) continue;

    const aIsNew = newIds.includes(a);
    const bIsNew = newIds.includes(b);

    if (aIsNew && !bIsNew) {
      apA.channel = apB.channel;
    } else if (!aIsNew && bIsNew) {
      apB.channel = apA.channel;
    } else {
      const channel = safeChannels[Math.floor(Math.random() * safeChannels.length)];
      apA.channel = channel;
      apB.channel = channel;
    }
  }

  return {
    aps: combinedAps,
    links,
  };
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
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [generateConfig, setGenerateConfig] = useState({
    apCount: 6,
    addMode: true,
  });

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

  function getCenteredViewportForAps(targetAps, padding = 135) {
    const items = Array.isArray(targetAps) && targetAps.length > 0 ? targetAps : aps;
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();

    const canvasWidth = rect?.width || 1000;
    const canvasHeight = rect?.height || 620;

    if (!items || items.length === 0) {
      return { x: 0, y: 0, scale: 1 };
    }

    const xs = items.map((ap) => Number(ap.x));
    const ys = items.map((ap) => Number(ap.y));

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const contentWidth = Math.max(1, maxX - minX + padding * 2);
    const contentHeight = Math.max(1, maxY - minY + padding * 2);

    const scale = Math.min(
      1.15,
      Math.max(0.25, Math.min(canvasWidth / contentWidth, canvasHeight / contentHeight))
    );

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return {
      x: Math.round(canvasWidth / 2 - centerX * scale),
      y: Math.round(canvasHeight / 2 - centerY * scale),
      scale,
    };
  }

  function centerSchema(targetAps = aps) {
    setViewport(getCenteredViewportForAps(targetAps));
  }

  function centerSchemaNextFrame(targetAps = aps) {
    requestAnimationFrame(() => {
      setViewport(getCenteredViewportForAps(targetAps));
    });
  }

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
    setShowGenerateForm(false);
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
    const nextAps = cloneAps(DEFAULT_1_APS);

    setAps(nextAps);
    setLinks(DEFAULT_1_LINKS.map((link) => [...link]));
    setViewport(getCenteredViewportForAps(nextAps));
    clearAllRuntimeStates();
  }

  function handleApplyGenerate(event) {
    event.preventDefault();

    const generated = generateConfig.addMode
      ? createAdditiveGeneratedNetwork(aps, links, generateConfig.apCount)
      : createGeneratedNetwork(generateConfig.apCount);

    const nextAps = cloneAps(generated.aps);

    setAps(nextAps);
    setLinks(generated.links.map((link) => [...link]));
    setViewport(getCenteredViewportForAps(nextAps));
    setSelectedAP(null);
    setLinkMode(false);
    setEditingId(null);
    setChannelMenu(null);
    setShowGenerateForm(false);
    setConstraintA("");
    setConstraintB("");
    setResult(null);
    setSimulation(null);
    setPlayIndex(0);
    setIsPlaying(false);
    setActiveStep(null);
    setActiveTab("aps");
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

  useEffect(() => {
    centerSchemaNextFrame(aps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    centerSchemaNextFrame(aps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelCollapsed]);

  useEffect(() => {
    const handleResize = () => centerSchemaNextFrame(aps);

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [aps]);

  function handleAddAP() {
    const nextId = aps.length > 0 ? Math.max(...aps.map((ap) => ap.id)) + 1 : 1;

    const newAP = {
      id: nextId,
      name: `AP-${String(nextId).padStart(2, "0")}`,
      x: 120 + Math.random() * 560,
      y: 90 + Math.random() * 420,
      channel: CHANNELS[Math.floor(Math.random() * CHANNELS.length)].id,
    };

    const nextAps = [...aps, newAP];

    setAps(nextAps);
    centerSchema(nextAps);
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

    const nextAps = [...aps, newAP];

    setAps(nextAps);
    centerSchema(nextAps);
    setChannelMenu(null);
    clearResultAndSimulation();
  }

  function handleDeleteAP(id) {
    const nextAps = aps.filter((ap) => ap.id !== id);
    const nextLinks = links.filter(([a, b]) => a !== id && b !== id);

    setAps(nextAps);
    setLinks(nextLinks);
    centerSchema(nextAps);
    setSelectedAP(null);
    setEditingId(null);
    setChannelMenu(null);
    clearResultAndSimulation();
  }

  function handleNameChange(apId, value) {
    const nextAps = aps.map((ap) =>
      ap.id === apId ? { ...ap, name: value } : ap
    );

    setAps(nextAps);
    centerSchema(nextAps);
    clearResultAndSimulation();
  }

  function handleChannelChange(apId, channel) {
    const nextAps = aps.map((ap) =>
      ap.id === apId ? { ...ap, channel: Number(channel) } : ap
    );

    setAps(nextAps);
    centerSchema(nextAps);
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
      centerSchemaNextFrame(aps);
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
    centerSchema(aps);
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

    centerSchema(aps);
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
      setLinks([...links, [x, y]]);
      centerSchema(aps);
      clearResultAndSimulation();
    }

    setConstraintA("");
    setConstraintB("");
    setChannelMenu(null);
  }

  function handleRemoveConstraint(a, b) {
    setLinks(links.filter((link) => !sameLink(link, a, b)));
    centerSchema(aps);
    setChannelMenu(null);
    clearResultAndSimulation();
  }

  function handleRandomize() {
    const nextAps = aps.map((ap) => ({
      ...ap,
      channel: CHANNELS[Math.floor(Math.random() * CHANNELS.length)].id,
    }));

    setAps(nextAps);
    centerSchema(nextAps);
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
    centerSchema(generated.initialAps);
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
      centerSchema(simulation.initialAps);
      setActiveStep(null);
      setPlayIndex(0);
      return;
    }

    const step = simulation.steps[index - 1];

    if (!step) return;

    setAps(cloneAps(step.afterAps));
    centerSchema(step.afterAps);
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
                className={`btn btn-small btn-complex ${
                  showGenerateForm ? "btn-active" : ""
                }`}
                onClick={() => {
                  setShowGenerateForm((prev) => !prev);
                  setChannelMenu(null);
                }}
              >
                Générer
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

          {showGenerateForm && (
            <form className="generate-panel generate-panel-simple" onSubmit={handleApplyGenerate}>
              <div className="generate-panel-head">
                <strong>Générer un schéma</strong>
                <span>Ajout activé : conserve les AP existants. Désactivé : crée un nouveau réseau.</span>
              </div>

              <label className="generate-field">
                <span>Nombre de AP</span>
                <input
                  type="number"
                  min="2"
                  max="60"
                  value={generateConfig.apCount}
                  onChange={(event) =>
                    setGenerateConfig((prev) => ({
                      ...prev,
                      apCount: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="generate-toggle">
                <input
                  type="checkbox"
                  checked={generateConfig.addMode}
                  onChange={(event) =>
                    setGenerateConfig((prev) => ({
                      ...prev,
                      addMode: event.target.checked,
                    }))
                  }
                />
                <span className="generate-toggle-ui">
                  <span />
                </span>
                <strong>Ajout</strong>
              </label>

              <button className="btn btn-run" type="submit">
                {generateConfig.addMode ? "Ajouter" : "Générer"}
              </button>
            </form>
          )}

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
                "--ap-counter-scale": 1 / viewport.scale,
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
            causé par des canaux trop proches. Le schéma par défaut est sans
            conflit ; le bouton Générer crée un réseau centré selon vos valeurs.
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