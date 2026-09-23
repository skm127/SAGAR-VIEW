/**
 * SAGAR VIEW main application shell.
 * Interactive 3D Ocean Intelligence & Visualization Platform (SIH 2026 // PS26067 - INCOIS).
 * Integrates:
 * - 3D Ocean Globe & Subsurface Water Column Depth Slabs
 * - Vertical Profile Sounding HUD with live cursor & readings
 * - Ocean Region Dossier
 * - Draw & Analyze / Region Analytics
 * - Ocean Transect Cross-Section Tool
 * - OSIRIS-Style Persistent Left Layer Rail
 * - Global Search (⌘K / Ctrl+K)
 * - Grounded Ocean Analyst AI
 */
import { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as THREE from 'three';
import Globe from './components/Globe/Globe';
import ControlBar from './components/Controls/ControlBar';
import Colorbar from './components/Controls/Colorbar';
import TimeAnimator from './components/Controls/TimeAnimator';
import InfoPanel from './components/Controls/InfoPanel';
import SectorNavigator from './components/Controls/SectorNavigator';
import FleetSidebar from './components/Panels/FleetSidebar';
import LayerRail from './components/Controls/LayerRail';
import ExplainabilityToggle from './components/Controls/ExplainabilityToggle';
import HoverSounderHUD from './components/Controls/HoverSounderHUD';
import DataSourceBadge from './components/Controls/DataSourceBadge';
import ViewportControls from './components/Controls/ViewportControls';
import ProductModeSelector, { type ProductMode } from './components/Controls/ProductModeSelector';
import ToastContainer from './components/Controls/ToastContainer';
import OnboardingHint from './components/Controls/OnboardingHint';

import { useOceanData } from './hooks/useOceanData';
import { useCurrentVectors } from './hooks/useCurrentVectors';
import { useArgoData } from './hooks/useArgoData';
import {
  getModelProfile,
  getArgoProfile,
  getAnomalySummary,
  getAllObservations,
  getHeatPotential,
  inspectHeatPotentialPoint,
} from './services/api';
import type { SensorSummary } from './services/api';
import type { AnomalyFleetSummary, HeatPotentialPoint } from './types';
import type { OceanSliceData } from './hooks/useOceanData';

import {
  getSectorCameraPosition,
  latLonToVector3,
  type SectorId,
} from './utils/coordinates';
import './App.css';

const TCHPInspectorCard = lazy(() => import('./components/Panels/TCHPInspectorCard'));
const ComparisonPanel = lazy(() => import('./components/Panels/ComparisonPanel'));
const MissionBriefingModal = lazy(() => import('./components/Panels/MissionBriefingModal'));
const VerticalProfileHUD = lazy(() => import('./components/Controls/VerticalProfileHUD'));
const OceanDossierModal = lazy(() => import('./components/Panels/OceanDossierModal'));
const RegionAnalysisModal = lazy(() => import('./components/Panels/RegionAnalysisModal'));
import { WeatherForecastModal } from './components/Panels/WeatherForecastModal';

const TransectModal = lazy(() => import('./components/Panels/TransectModal'));
const GlobalSearchModal = lazy(() => import('./components/Panels/GlobalSearchModal'));
const AiAnalystModal = lazy(() => import('./components/Panels/AiAnalystModal'));
const DataProvenanceModal = lazy(() => import('./components/Panels/DataProvenanceModal'));
const OperationalSituationRoom = lazy(() => import('./components/Panels/OperationalSituationRoom'));
const LearnStoryJourney = lazy(() => import('./components/Panels/LearnStoryJourney'));
const DataManagerModal = lazy(() => import('./components/Panels/DataManagerModal'));
const CoLocationModal = lazy(() => import('./components/Panels/CoLocationModal'));
const SoundingStudioPage = lazy(() => import('./components/Panels/SoundingStudioPage'));
const RealtimePredictionModal = lazy(() => import('./components/Panels/RealtimePredictionModal'));
const CycloneIntelligenceModal = lazy(() => import('./components/Panels/CycloneIntelligenceModal'));
const ModelTrustModal = lazy(() => import('./components/Panels/ModelTrustModal'));
import {
  getCycloneHistory,
  getActiveCyclones,
  getAdvisories,
  getConfidenceField,
  type HistoricalStorm,
  type LiveStorm,
  type AdvisoriesResponse,
  type ConfidenceFieldResponse,
} from './services/intelApi';
import OceanGuideAgent from './components/OceanGuide/OceanGuideAgent';

import { useLiveFeed } from './hooks/useLiveFeed';
import { LiveConnectionIndicator } from './components/Controls/LiveConnectionIndicator';
import { useUIStore } from './store/uiStore';
import { Search, AlertTriangle, Bot, Activity, ChevronDown, Crosshair, Map, Brain, Database, FileText, Camera, Keyboard, Anchor, Tornado, ShieldCheck } from 'lucide-react';

function App() {
  const {
    sliceData,
    datasetInfo,
    loading: sliceLoading,
    error,
    variable,
    depth,
    timeIndex,
    depthLevels,
    timeSteps,
    dates,
    setVariable,
    setDepth,
    setTimeIndex,
  } = useOceanData();

  // Subscribe to SSE Live Feed
  const liveFeed = useLiveFeed();

  const {
    vectors,
    speedMin,
    speedMax,
    loading: currentsLoading,
    visible: showCurrents,
    setVisible: setShowCurrents,
  } = useCurrentVectors(depth, timeIndex);

  const {
    profiles: argoProfiles,
    selectedProfileId,
    setSelectedProfileId,
  } = useArgoData();

  // Sector and Camera flight state
  const [currentSector, setCurrentSector] = useState<SectorId>('all_india');
  const [targetCameraPos, setTargetCameraPos] = useState<THREE.Vector3 | null>(null);
  const {
    productMode, setProductMode,
    explainMode, setExplainMode,
    briefingOpen, setBriefingOpen,
    provenanceOpen, setProvenanceOpen,
    coLocationOpen, setCoLocationOpen,
    transectModalOpen, setTransectModalOpen,
    searchModalOpen, setSearchModalOpen,
    realtimeModalOpen, setRealtimeModalOpen,
    guideOpen, setGuideOpen,
    toolsMenuOpen, setToolsMenuOpen,
  } = useUIStore();

  const [fleetOpen, setFleetOpen] = useState(false);
  const [probedCoord, setProbedCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [oceanOpacity, setOceanOpacity] = useState<number>(0.82);
  const [showHotkeys, setShowHotkeys] = useState<boolean>(false);

  // Intelligence & Spatial Modals
  const [dossierCoord, setDossierCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [regionBounds, setRegionBounds] = useState({ latMin: 10, latMax: 22, lonMin: 80, lonMax: 92 });
  const [transectLine, setTransectLine] = useState({ lat1: 10, lon1: 85, lat2: 19, lon2: 89 });
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [hoverCoord, setHoverCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [cameraPitch, setCameraPitch] = useState<number>(50);

  // Vertical Profile HUD state
  const [profileHudData, setProfileHudData] = useState<{
    isOpen: boolean;
    lat: number;
    lon: number;
    depths: number[];
    modelValues: (number | null)[];
    observedValues: (number | null)[] | null;
  }>({
    isOpen: false,
    lat: 14.5,
    lon: 84.8,
    depths: [],
    modelValues: [],
    observedValues: null,
  });

  // Layer Rail Toggles
  const [layerRailOpen, setLayerRailOpen] = useState(true);
  const [showArgo, setShowArgo] = useState(true);
  // Independent visibility toggles for buoy/glider platform layers.
  const [showBuoys, setShowBuoys] = useState(true);
  const [showGliders, setShowGliders] = useState(true);
  const [showSST, setShowSST] = useState(false);
  const [windyOverlay, setWindyOverlay] = useState<string | null>(null);
  const [showWeatherForecast, setShowWeatherForecast] = useState(false);
  const [showCyclones, setShowCyclones] = useState(true);
  const [showTCHP, setShowTCHP] = useState<boolean>(false);
  const [tchpSliceData, setTchpSliceData] = useState<OceanSliceData | null>(null);
  const [tchpPointData, setTchpPointData] = useState<HeatPotentialPoint | null>(null);
  const [showVolumetricBlock, setShowVolumetricBlock] = useState(true);
  const [verticalExaggeration, setVerticalExaggeration] = useState(1.0);

  // Fetch TCHP 2D grid whenever showTCHP is active or timeIndex changes
  useEffect(() => {
    if (!showTCHP) return;
    getHeatPotential({ time_index: timeIndex })
      .then((res) => {
        if (!res) return;
        const { metadata, statistics, tchp } = res;
        const width = metadata.width;
        const height = metadata.height;
        const flatValues = new Float32Array(width * height);
        for (let r = 0; r < height; r++) {
          for (let c = 0; c < width; c++) {
            const v = tchp[r]?.[c];
            flatValues[r * width + c] = v !== null && v !== undefined ? v : -9999;
          }
        }
        setTchpSliceData({
          variable: 'tchp',
          depth: 0,
          latMin: metadata.lat_min,
          latMax: metadata.lat_max,
          lonMin: metadata.lon_min,
          lonMax: metadata.lon_max,
          width,
          height,
          vMin: 0,
          vMax: Math.max(100, statistics.tchp_max || 100),
          values: flatValues,
        });
      })
      .catch((err) => console.warn('Failed to fetch TCHP data', err));

  }, [showTCHP, timeIndex]);


  // ── Cyclone Intelligence, Model Trust & Advisories (real data) ─────────
  const [cycloneModalOpen, setCycloneModalOpen] = useState(false);
  const [trustModalOpen, setTrustModalOpen] = useState(false);
  const [cycloneHistory, setCycloneHistory] = useState<HistoricalStorm[]>([]);
  const [cycloneLive, setCycloneLive] = useState<LiveStorm[]>([]);
  const [selectedCycloneSid, setSelectedCycloneSid] = useState<string | null>(null);
  const [advisories, setAdvisories] = useState<AdvisoriesResponse | null>(null);
  const [showConfidence, setShowConfidence] = useState(false);
  const [confidenceField, setConfidenceField] = useState<ConfidenceFieldResponse | null>(null);

  useEffect(() => {
    getCycloneHistory(2015).then((r) => setCycloneHistory(r.storms ?? [])).catch(() => {});
    const loadLive = () =>
      getActiveCyclones()
        .then((r) => setCycloneLive((r.storms ?? []).filter((st) => st.is_current)))
        .catch(() => {});
    const loadAdvisories = () => getAdvisories().then(setAdvisories).catch(() => {});
    loadLive();
    loadAdvisories();
    const a = setInterval(loadLive, 30 * 60 * 1000);
    const b = setInterval(loadAdvisories, 15 * 60 * 1000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);

  // Only draw hurricane-strength storms (≥ 64 kt) plus the selected one, to keep the globe readable
  const visibleCycloneHistory = useMemo(
    () => cycloneHistory.filter((st) => (st.peak_wind_kt ?? 0) >= 64 || st.sid === selectedCycloneSid),
    [cycloneHistory, selectedCycloneSid]
  );

  useEffect(() => {
    if ((!showConfidence && !trustModalOpen) || confidenceField) return;
    getConfidenceField().then(setConfidenceField).catch((e) => console.warn('Confidence field unavailable', e));
  }, [showConfidence, trustModalOpen, confidenceField]);

  const confidenceSlice: OceanSliceData | null = useMemo(() => {
    if (!confidenceField) return null;
    const m = confidenceField.metadata;
    const flat = new Float32Array(m.width * m.height);
    for (let r = 0; r < m.height; r++) {
      for (let c = 0; c < m.width; c++) {
        const v = confidenceField.confidence[r]?.[c];
        flat[r * m.width + c] = v != null ? v : -9999;
      }
    }
    return {
      variable: 'confidence', depth: 0,
      latMin: m.lat_min, latMax: m.lat_max, lonMin: m.lon_min, lonMax: m.lon_max,
      width: m.width, height: m.height, vMin: 0, vMax: 1, values: flat,
    };
  }, [confidenceField]);

  // Dynamic Fleet Anomaly Intelligence & Sensor Network Counters
  const [anomalySummary, setAnomalySummary] = useState<AnomalyFleetSummary | null>(null);
  const [sensorNetworkCount, setSensorNetworkCount] = useState<number>(argoProfiles.length);
  // Buoy/glider platforms as reported by the backend — drives globe markers and layer counts.
  const [buoyPlatforms, setBuoyPlatforms] = useState<SensorSummary[]>([]);
  const [gliderPlatforms, setGliderPlatforms] = useState<SensorSummary[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchAnomaly = () => {
      getAnomalySummary()
        .then((res) => {
          if (res && isMounted) setAnomalySummary(res);
        })
        .catch(() => {});
    };

    fetchAnomaly(); // Initial fetch
    // Poll every 5 minutes (300,000 ms) for real-time alerts
    const intervalId = setInterval(fetchAnomaly, 300000);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [timeIndex]);

  useEffect(() => {
    let isMounted = true;
    const fetchObservations = () => {
      getAllObservations()
        .then((res) => {
          if (!isMounted) return;
          setBuoyPlatforms(res?.moored_buoys ?? []);
          setGliderPlatforms(res?.gliders ?? []);
          if (res && typeof res.total_platforms === 'number') {
            setSensorNetworkCount(res.total_platforms);
          }
        })
        .catch(() => {});
    };

    fetchObservations(); // Initial fetch
    // Poll every 5 minutes (300,000 ms) for new platforms
    const intervalId = setInterval(fetchObservations, 300000);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [argoProfiles.length]);

  // Live UTC Clock
  const [utcTime, setUtcTime] = useState('');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toUTCString().slice(17, 25) + ' UTC');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const currentDate = dates[timeIndex] || `Day ${timeIndex + 1}`;
  const totalLoading = sliceLoading || currentsLoading;

  // WebGL Screenshot snapshot handler
  const handleCaptureSnapshot = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `OCEANX_SURVEILLANCE_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.png`;
    a.click();
  };

  // Sector selection handler
  const handleSelectSector = (sectorId: SectorId) => {
    setCurrentSector(sectorId);
    setTargetCameraPos(getSectorCameraPosition(sectorId));

    if (sectorId === 'anomaly_target') {
      const topFloat = anomalySummary?.highest_anomaly_float;
      const target = topFloat
        ? argoProfiles.find((p) => p.id === topFloat.id || p.platform_id === topFloat.platform_id) || {
            id: topFloat.id,
            platform_id: topFloat.platform_id,
            latitude: topFloat.latitude,
            longitude: topFloat.longitude,
          }
        : argoProfiles[0];

      if (target) {
        setSelectedProfileId(target.id);
        setProbedCoord({ lat: target.latitude, lon: target.longitude });
        // Fly the camera to the float's LIVE coordinates, not a static sector preset
        // (the top-anomaly float drifts; the preset was a hardcoded demo position).
        setTargetCameraPos(latLonToVector3(target.latitude, target.longitude, 4.6));
        // Fetch profile data for HUD
        loadProfileForLocation(target.latitude, target.longitude, target.id);
      }
    }
  };

  // Load vertical profile sounding data for HUD
  const loadProfileForLocation = useCallback(
    async (lat: number, lon: number, floatId?: string) => {
      try {
        const mProfile = await getModelProfile(variable, lat, lon, timeIndex);
        let obsVals: (number | null)[] | null = null;

        if (floatId) {
          const fProfile = await getArgoProfile(floatId);
          if (fProfile && fProfile.temperatures && fProfile.depths) {
            // Map float observed values to model depths
            obsVals = mProfile.depths.map((d: number) => {
              const idx = fProfile.depths.findIndex((fd) => Math.abs(fd - d) < 15);
              return idx !== -1 && fProfile.temperatures ? fProfile.temperatures[idx] : null;
            });
          }
        }

        setProfileHudData({
          isOpen: true,
          lat,
          lon,
          depths: mProfile.depths,
          modelValues: mProfile.values,
          observedValues: obsVals,
        });
      } catch (err) {
        console.warn('Failed to load profile for location', err);
      }
    },
    [variable, timeIndex]
  );

  // Non-Argo platforms (buoys/gliders) indexed by marker id for fly-to selection.
  const allSensorsById = useMemo(() => {
    const idx: Record<string, { lat: number; lon: number }> = {};
    for (const b of buoyPlatforms) idx[b.id] = { lat: b.latitude, lon: b.longitude };
    for (const g of gliderPlatforms) idx[g.id] = { lat: g.latitude, lon: g.longitude };
    return idx;
  }, [buoyPlatforms, gliderPlatforms]);

  // platform_id -> anomaly status from the live fleet analysis; drives marker colors.
  const platformStatusMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of anomalySummary?.fleet ?? []) map[f.platform_id] = f.status;
    
    const allPlatforms = [...argoProfiles, ...buoyPlatforms, ...gliderPlatforms];
    for (const p of allPlatforms) {
      for (const storm of cycloneLive) {
        const dist = Math.hypot(p.latitude - storm.lat, p.longitude - storm.lon);
        if (dist < 3.5) {
          map[p.platform_id] = 'CRITICAL_ANOMALY';
          break;
        } else if (dist < 6.0 && map[p.platform_id] !== 'CRITICAL_ANOMALY') {
          map[p.platform_id] = 'WARNING';
        }
      }
    }
    return map;
  }, [anomalySummary, argoProfiles, buoyPlatforms, gliderPlatforms, cycloneLive]);

  // Multi-sensor platform selection with smooth camera fly-to (Argo, Buoys, Gliders)
  const handleSelectArgo = (id: string) => {
    setSelectedProfileId(id);
    setProfileHudData((prev) => ({ ...prev, isOpen: false }));
    // Accept either the internal profile id (argo_2902345_0) or the bare
    // platform_id (2902345) that callers like the AI guide tours pass.
    const p = argoProfiles.find((item) => item.id === id || item.platform_id === id);
    if (p) {
      setProbedCoord({ lat: p.latitude, lon: p.longitude });
      setTargetCameraPos(latLonToVector3(p.latitude, p.longitude, 4.6));
      loadProfileForLocation(p.latitude, p.longitude, id);
    } else {
      const s = allSensorsById[id];
      if (s) {
        setProbedCoord({ lat: s.lat, lon: s.lon });
        setTargetCameraPos(latLonToVector3(s.lat, s.lon, 4.4));
        loadProfileForLocation(s.lat, s.lon, id);
      }
    }
  };

  // Ocean surface coordinate left-click probe
  const handleProbeCoordinate = (coord: { lat: number; lon: number }) => {
    setProbedCoord(coord);
    setSelectedProfileId(null);
    loadProfileForLocation(coord.lat, coord.lon);
    if (showTCHP) {
      inspectHeatPotentialPoint({ lat: coord.lat, lon: coord.lon, time_index: timeIndex })
        .then(setTchpPointData)
        .catch(() => {});
    }
  };

  // Quick preset: Bay of Bengal Cyclone Season View (12°N, 88°E, Depth 0m, TCHP active)
  const handleCycloneSeasonView = () => {
    handleSelectSector('bay_of_bengal');
    setTargetCameraPos(getSectorCameraPosition('bay_of_bengal'));
    setDepth(0);
    setShowTCHP(true);
    inspectHeatPotentialPoint({ lat: 14.0, lon: 88.0, time_index: timeIndex })
      .then(setTchpPointData)
      .catch(() => {});
  };

  // Ocean surface right-click -> Ocean Region Dossier
  const handleContextMenuCoordinate = (coord: { lat: number; lon: number }) => {
    setDossierCoord(coord);
    setProbedCoord(coord);
  };


  // Start transect from a specific coordinate
  const handleStartTransectFromHere = (lat: number, lon: number) => {
    setTransectLine({
      lat1: lat,
      lon1: lon,
      lat2: Math.min(26, lat + 8),
      lon2: Math.min(94, lon + 5),
    });
    setTransectModalOpen(true);
  };

  // Start region analysis from a specific coordinate
  const handleAnalyzeRegionHere = (lat: number, lon: number) => {
    setRegionBounds({
      latMin: Math.max(0, lat - 4),
      latMax: Math.min(28, lat + 4),
      lonMin: Math.max(60, lon - 4),
      lonMax: Math.min(100, lon + 4),
    });
    setRegionModalOpen(true);
  };

  // SAGAR-VIEW Product Mode change handler with explainMode backward compatibility
  const handleProductModeChange = (mode: ProductMode) => {
    setProductMode(mode);
    // Map product mode to explainMode for ComparisonPanel & HoverSounderHUD backward compat
    if (mode === 'research') {
      // Research mode preserves current explainMode (citizen/scientist toggle stays)
    } else if (mode === 'operational') {
      setExplainMode('citizen');
    } else if (mode === 'learn') {
      setExplainMode('citizen');
    } else if (mode === 'datamanager') {
      setExplainMode('scientist');
    }
  };

  // Camera fly-to handler for LearnStoryJourney
  const handleCameraFlyTo = (lat: number, lon: number, altitude?: number) => {
    setTargetCameraPos(latLonToVector3(lat, lon, altitude ?? 4.6));
  };

  // Keep fresh references for keyboard handlers to prevent stale closures
  const handleSelectSectorRef = useRef(handleSelectSector);
  handleSelectSectorRef.current = handleSelectSector;

  // C2 Keyboard Command Hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      // ⌘K / Ctrl+K -> Global Search
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
        return;
      }

      if (e.key === 'Escape') {
        setSelectedProfileId(null);
        setProbedCoord(null);
        setDossierCoord(null);
        setRegionModalOpen(false);
        setTransectModalOpen(false);
        setSearchModalOpen(false);
        setAiModalOpen(false);
        setFleetOpen(false);
        setShowHotkeys(false);
        setBriefingOpen(false);
        setCoLocationOpen(false);
        setGuideOpen(false);
        setRealtimeModalOpen(false);
        setCycloneModalOpen(false);
        setTrustModalOpen(false);
      } else if (e.key === '1') {
        handleSelectSectorRef.current('all_india');
      } else if (e.key === '2') {
        handleSelectSectorRef.current('arabian_sea');
      } else if (e.key === '3') {
        handleSelectSectorRef.current('bay_of_bengal');
      } else if (e.key === '4') {
        handleSelectSectorRef.current('anomaly_target');
      } else if (e.key === '5') {
        handleSelectSectorRef.current('equatorial');
      } else if (e.key === 'g' || e.key === 'G') {
        setGuideOpen((prev) => !prev);
      } else if (e.key === 'b' || e.key === 'B') {
        setBriefingOpen((prev) => !prev);
      } else if (e.key === 'c' || e.key === 'C') {
        setShowCurrents((prev) => !prev);
      } else if (e.key === 'l' || e.key === 'L') {
        setLayerRailOpen((prev) => !prev);
      } else if (e.key === 't' || e.key === 'T') {
        setTransectModalOpen((prev) => !prev);
      } else if (e.key === 'r' || e.key === 'R') {
        setRegionModalOpen((prev) => !prev);
      } else if (e.key === 'a' || e.key === 'A' || e.key === 'i' || e.key === 'I') {
        setAiModalOpen((prev) => !prev);
      } else if (e.key === 'p' || e.key === 'P') {
        setProfileHudData((prev) => {
          const next = !prev.isOpen;
          if (next) setSelectedProfileId(null);
          return { ...prev, isOpen: next };
        });
      } else if (e.key === 'f' || e.key === 'F') {
        setFleetOpen((prev) => !prev);
      } else if (e.key === '?') {
        setShowHotkeys((prev) => !prev);
      } else if (e.key === 'd' || e.key === 'D') {
        setRealtimeModalOpen((prev) => !prev);
      } else if (e.key === 'y' || e.key === 'Y') {
        setCycloneModalOpen((prev) => !prev);
      } else if (e.key === 'm' || e.key === 'M') {
        setTrustModalOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const unit = variable === 'thetao' ? '°C' : variable === 'so' ? 'PSU' : 'm/s';

  return (
    <div className="app">
      {/* Real-time Scientific & Operational Toast Notifications */}
      <ToastContainer />

      {/* First-Run Operational Orientation Hint */}
      <OnboardingHint />

      {/* Scientific Ocean Intelligence Header */}
      <header className="top-bar">
        <div className="top-bar-left">
          <div className="logo">
            <div className="logo-text">
              <h1>SAGAR VIEW</h1>
              <span className="logo-subtitle">SCIENTIFIC 3D OCEAN WORKSTATION</span>
            </div>
          </div>
          
          <DataSourceBadge />

          {/* Global Search Bar (⌘K / Ctrl+K) */}
          <div className="global-search-bar" onClick={() => setSearchModalOpen(true)}>
            <Search size={14} />
            <span className="search-bar-placeholder">Search domain, platform, variable...</span>
            <span className="search-bar-kbd">⌘K</span>
          </div>
        </div>

        {/* View Lens Switcher & Ocean Basin Presets */}
        <div className="top-bar-center">
          <ProductModeSelector currentMode={productMode} onSelectMode={handleProductModeChange} />
          {productMode === 'research' && (
            <ExplainabilityToggle mode={explainMode} onChange={setExplainMode} />
          )}
          <SectorNavigator
            currentSector={currentSector}
            onSelectSector={handleSelectSector}
          />
        </div>

        <div className="top-bar-right">
          <span className="utc-clock">{utcTime}</span>

          <LiveConnectionIndicator 
            status={liveFeed.connectionStatus} 
            lastUpdated={liveFeed.lastUpdated}
            currentTime={new Date()}
            datasetTimeRange={datasetInfo?.dataset_time_range as [string | null, string | null] | undefined}
            isSynthetic={datasetInfo?.is_synthetic ?? true}
          />

          {/* Significant Anomaly Alert Badge */}
          {(() => {
            const anomCount = anomalySummary
              ? anomalySummary.critical_count + anomalySummary.warning_count
              : 0;
            if (anomCount === 0) return null;
            return (
              <button
                className="c2-badge anomaly-alert-badge anomaly-clickable"
                onClick={() => handleSelectSector('anomaly_target')}
                title={`Inspect Subsurface Thermal Anomalies (${anomCount} detected, Key: 4)`}
              >
                <AlertTriangle size={14} />
                {anomCount} {anomCount === 1 ? 'ANOMALY' : 'ANOMALIES'}
              </button>
            );
          })()}

          {/* Interactive Layman AI Ocean Guide */}
          <button
            className={`c2-badge ai-guide-top-btn ${guideOpen ? 'active' : ''}`}
            onClick={() => setGuideOpen((prev) => !prev)}
            title="Open Layman AI Ocean Guide (Key: G) - Plain-English translation of everything on screen"
          >
            <Bot size={14} />
            <span>AI GUIDE</span>
          </button>

          {/* Real-Time Live Ocean Data & Predictions */}
          <button
            className={`c2-badge ai-guide-top-btn ${realtimeModalOpen ? 'active' : ''}`}
            onClick={() => setRealtimeModalOpen((prev) => !prev)}
            title="Live Ocean Telemetry & 72-Hour Predictions (Key: D)"
            style={{ background: realtimeModalOpen ? 'rgba(255,255,255,0.1)' : undefined }}
          >
            <Activity size={14} />
            <span>LIVE DATA</span>
          </button>

          {/* Cyclone Intelligence: live GDACS + historical RI backtests */}
          <button
            className={`c2-badge ai-guide-top-btn ${cycloneModalOpen ? 'active' : ''}`}
            onClick={() => setCycloneModalOpen((prev) => !prev)}
            title="Cyclone Intelligence: live GDACS storms, TCHP along forecast track, Argo-only RI backtests (Key: Y)"
          >
            <Tornado size={14} />
            <span>CYCLONES{cycloneLive.some((st) => st.in_north_indian_ocean) ? ' •' : ''}</span>
          </button>

          {/* Model Trust: depth-band skill + spatial confidence */}
          <button
            className={`c2-badge ai-guide-top-btn ${trustModalOpen ? 'active' : ''}`}
            onClick={() => setTrustModalOpen((prev) => !prev)}
            title="Model Trust: Argo-verified skill by depth band and spatial confidence (Key: M)"
          >
            <ShieldCheck size={14} />
            <span>MODEL TRUST</span>
          </button>

          {/* Data Provenance & Methodology */}
          <button
            className="c2-badge tool-btn"
            onClick={() => setProvenanceOpen(true)}
            title="View Data Provenance, Grid Resolution & ML Methods"
          >
            PROVENANCE
          </button>

          {/* Spatial & AI Analysis Tools Dropdown */}
          <div className="tools-dropdown-container">
            <button
              className={`c2-badge tool-btn ${toolsMenuOpen ? 'active' : ''}`}
              onClick={() => setToolsMenuOpen(!toolsMenuOpen)}
              title="Spatial & ML Analysis Tools"
            >
              ANALYSIS <ChevronDown size={14} />
            </button>
            {toolsMenuOpen && (
              <div className="tools-dropdown-menu">
                <button className="tools-menu-item" onClick={() => { setTransectModalOpen(true); setToolsMenuOpen(false); }}>
                  <Crosshair size={14} />
                  <span className="item-text">Ocean Transect Subsurface</span>
                </button>
                <button className="tools-menu-item" onClick={() => { setRegionModalOpen(true); setToolsMenuOpen(false); }}>
                  <Map size={14} />
                  <span className="item-text">Draw Region Analytics</span>
                </button>
                <button className="tools-menu-item" onClick={() => { setAiModalOpen(true); setToolsMenuOpen(false); }}>
                  <Brain size={14} />
                  <span className="item-text">Grounded ML Analyst</span>
                </button>
                <button className="tools-menu-item" onClick={() => { setCoLocationOpen(true); setToolsMenuOpen(false); }}>
                  <Database size={14} />
                  <div className="item-text">
                    <span>In-Situ Co-Location Matcher</span>
                    <span className="item-desc">Model-observation spatial matching</span>
                  </div>
                </button>
                <button className="tools-menu-item" onClick={() => { setBriefingOpen(true); setToolsMenuOpen(false); }}>
                  <FileText size={14} />
                  <span className="item-text">Mission Briefing & Scope</span>
                </button>
              </div>
            )}
          </div>

          {/* In-Situ Multi-Sensor Platform Network Count */}
          <button
            className="c2-badge tool-btn"
            onClick={() => setFleetOpen(!fleetOpen)}
            title="Inspect Active In-Situ Sensor Network (Key: F)"
          >
            <Anchor size={14} /> {sensorNetworkCount} SENSORS
          </button>

          {/* Scientific Briefing */}
          <button
            className="c2-badge tool-btn"
            onClick={() => setBriefingOpen(true)}
            title="SIH26067 Scientific Brief & Evaluation Guide (Key: B)"
          >
            BRIEF
          </button>

          {/* Snapshot Export */}
          <button
            className="c2-badge tool-btn"
            onClick={handleCaptureSnapshot}
            title="Export High-Resolution Canvas"
          >
            <Camera size={14} /> EXPORT
          </button>

          {/* Keyboard Shortcuts Matrix */}
          <button
            className="c2-badge tool-btn"
            onClick={() => setShowHotkeys(!showHotkeys)}
            title="Keyboard Shortcuts Guide (Key: ?)"
          >
            <Keyboard size={14} />
          </button>
        </div>
      </header>

      {/* SAGAR-VIEW Operational Situation Room Banner */}
      {productMode === 'operational' && (
        <Suspense fallback={null}>
          <OperationalSituationRoom
            data={{
              topFloatId: anomalySummary?.highest_anomaly_float?.platform_id ?? null,
              topFloatStatus: anomalySummary?.highest_anomaly_float?.status ?? null,
              maxDelta: anomalySummary?.highest_anomaly_float?.max_delta ?? null,
              maxDepth: anomalySummary?.highest_anomaly_float?.max_depth ?? null,
              criticalCount: anomalySummary?.critical_count ?? 0,
              tchpKjCm2: tchpPointData?.tchp ?? null,
              argoCount: argoProfiles.length,
              floatCount: sensorNetworkCount,
              activeNioCyclones: cycloneLive.filter((st) => st.in_north_indian_ocean).length,
              advisories: advisories?.advisories ?? [],
              advisoriesValidTime: advisories?.valid_time ?? null,
            }}
            onJumpToAnomaly={() => handleSelectSector('anomaly_target')}
            onJumpTo={(lat, lon) => {
              handleCameraFlyTo(lat, lon, 4.6);
              setProbedCoord({ lat, lon });
            }}
            onOpenCyclones={() => setCycloneModalOpen(true)}
            onOpenModelTrust={() => setTrustModalOpen(true)}
            onClose={() => setProductMode('research')}
          />
        </Suspense>
      )}

      {/* 3D Ocean Viewport */}
      <main className="viewport">
        {/* Google Earth Style On-Screen Viewport Navigation Controls */}
        <ViewportControls
          cameraPitch={cameraPitch}
          onPitchChange={setCameraPitch}
          onResetNadir={() => {
            setCameraPitch(75);
            setCurrentSector('all_india');
            setTargetCameraPos(getSectorCameraPosition('all_india'));
          }}
        />
        {/* Persistent Left Layer Rail */}
        <LayerRail
          variable={variable}
          depth={depth}
          showCurrents={showCurrents}
          opacity={oceanOpacity}
          showArgo={showArgo}
          showBuoys={showBuoys}
          showGliders={showGliders}
          argoCount={argoProfiles.length}
          buoyCount={buoyPlatforms.length}
          gliderCount={gliderPlatforms.length}
          showSST={showSST}
          showWindy={windyOverlay}
          showCyclones={showCyclones}
          showTCHP={showTCHP}
          showConfidence={showConfidence}
          onToggleConfidence={() => setShowConfidence((v) => !v)}
          showVolumetricBlock={showVolumetricBlock}
          verticalExaggeration={verticalExaggeration}
          onVariableChange={setVariable}
          onToggleCurrents={() => setShowCurrents((visible) => !visible)}
          onToggleArgo={() => setShowArgo((visible) => !visible)}
          onToggleBuoys={() => setShowBuoys((visible) => !visible)}
          onToggleGliders={() => setShowGliders((visible) => !visible)}
          onToggleSST={() => {
            const next = !showSST;
            setShowSST(next);
            if (next) {
              setVariable('thetao');
              setDepth(0);
              setWindyOverlay(null);
            }
          }}
          onToggleWindy={(overlay: string | null) => {
            setWindyOverlay(overlay);
            if (overlay) setShowSST(false);
          }}
          showWeatherForecast={showWeatherForecast}
          onToggleWeatherForecast={() => setShowWeatherForecast((v) => !v)}
          onToggleCyclones={() => setShowCyclones((visible) => !visible)}
          onToggleTCHP={() => {
            const next = !showTCHP;
            setShowTCHP(next);
            if (!next) setTchpPointData(null);
          }}
          onCycloneSeasonView={handleCycloneSeasonView}
          onToggleVolumetricBlock={() => setShowVolumetricBlock((visible) => !visible)}
          onVerticalExaggerationChange={setVerticalExaggeration}
          onOpacityChange={setOceanOpacity}
          onOpenTransect={() => setTransectModalOpen(true)}
          onOpenRegionAnalysis={() => setRegionModalOpen(true)}
          isOpen={layerRailOpen}
          onToggleOpen={() => setLayerRailOpen(!layerRailOpen)}
        />

        {/* Real-time View Diagnostics & Parameter Card */}
        {sliceData && !fleetOpen && !layerRailOpen && (
          <InfoPanel
            variable={variable}
            depth={depth}
            date={dates[timeIndex] ? new Date(dates[timeIndex]).toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'medium' }) + ' UTC' : ''}
            vMin={sliceData.vMin}
            vMax={sliceData.vMax}
            loading={totalLoading}
            showCurrents={showCurrents}
            opacity={oceanOpacity}
            fleetCount={argoProfiles.length}
            onOpacityChange={setOceanOpacity}
            onOpenFleet={() => setFleetOpen(!fleetOpen)}
            railOpen={layerRailOpen}
          />
        )}

        {/* In-Situ Fleet Sidebar Drawer */}
        <FleetSidebar
          profiles={argoProfiles}
          buoys={buoyPlatforms}
          gliders={gliderPlatforms}
          platformStatus={platformStatusMap}
          selectedId={selectedProfileId}
          isOpen={fleetOpen}
          onToggle={() => setFleetOpen(!fleetOpen)}
          onSelect={handleSelectArgo}
          railOpen={layerRailOpen}
        />

        {/* 3D Globe with continents, ocean raster, currents, and Argo markers */}
        <Globe
          sliceData={showConfidence && confidenceSlice ? confidenceSlice : showTCHP && tchpSliceData ? tchpSliceData : sliceData}
          showCyclones={showCyclones}
          cycloneHistory={visibleCycloneHistory}
          cycloneLive={cycloneLive}
          selectedCycloneSid={selectedCycloneSid}
          currentVectors={vectors}
          currentSpeedMin={speedMin}
          currentSpeedMax={speedMax}
          showCurrents={showCurrents}
          argoProfiles={showArgo ? argoProfiles : []}
          extraPlatforms={
            [
              ...(showBuoys ? buoyPlatforms : []),
              ...(showGliders ? gliderPlatforms : []),
            ].map((s) => ({
              id: s.id,
              platform_id: s.platform_id,
              lat: s.latitude,
              lon: s.longitude,
              name: s.platform_id,
              kind: (s.type === 'glider' ? 'glider' : 'buoy') as 'buoy' | 'glider',
            }))
          }
          platformStatus={platformStatusMap}
          selectedArgoId={selectedProfileId}
          targetCameraPos={targetCameraPos}
          cameraPitch={cameraPitch}
          probedCoordinate={probedCoord}
          onHoverCoordinate={setHoverCoord}
          oceanOpacity={oceanOpacity}
          depthLevels={depthLevels}
          showVolumetricBlock={showVolumetricBlock}
          verticalExaggeration={verticalExaggeration}
          onSelectArgo={handleSelectArgo}
          onProbeCoordinate={handleProbeCoordinate}
          onContextMenuCoordinate={handleContextMenuCoordinate}
          onCameraFlightComplete={() => setTargetCameraPos(null)}
        />

        {/* Windy Map Overlay */}
        {windyOverlay && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 10,
              backgroundColor: '#000',
              pointerEvents: 'auto',
            }}
          >
            <iframe
              width="100%"
              height="100%"
              src={`https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=default&metricTemp=default&metricWind=default&zoom=5&overlay=${windyOverlay}&product=ecmwf&level=surface&lat=22.2&lon=83.8`}
              frameBorder="0"
              style={{ border: 'none' }}
              title={`Live Radar: ${windyOverlay}`}
            ></iframe>
          </div>
        )}

        {/* Floating Vertical Profile Sounding HUD */}
        {profileHudData.isOpen && (
          <Suspense fallback={null}>
            <VerticalProfileHUD
              title={selectedProfileId ? 'Observation vs Model Sounding' : 'Vertical profile'}
              latitude={profileHudData.lat}
              longitude={profileHudData.lon}
              depths={profileHudData.depths}
              modelValues={profileHudData.modelValues}
              observedValues={profileHudData.observedValues}
              variable={variable}
              unit={unit}
              currentDepth={depth}
              onDepthSelect={(d) => setDepth(d)}
              onClose={() => setProfileHudData((prev) => ({ ...prev, isOpen: false }))}
            />
          </Suspense>
        )}

        {/* Right-Click Ocean Region Dossier Modal */}
        {dossierCoord && (
          <Suspense fallback={null}>
            <OceanDossierModal
              coordinate={dossierCoord}
              depth={depth}
              timeIndex={timeIndex}
              date={currentDate}
              onClose={() => setDossierCoord(null)}
              onOpenProfile={(lat, lon, depths, vals) => {
                setProfileHudData({
                  isOpen: true,
                  lat,
                  lon,
                  depths,
                  modelValues: vals,
                  observedValues: null,
                });
              }}
              onSelectArgo={handleSelectArgo}
              onStartTransectFromHere={handleStartTransectFromHere}
              onAnalyzeRegionHere={handleAnalyzeRegionHere}
            />
          </Suspense>
        )}

        {/* Region Analysis Bounding Box Modal */}
        {regionModalOpen && (
          <Suspense fallback={null}>
            <RegionAnalysisModal
              initialBounds={regionBounds}
              depth={depth}
              timeIndex={timeIndex}
              variable={variable}
              sliceData={sliceData}
              date={currentDate}
              onClose={() => setRegionModalOpen(false)}
              onFocusRegion={(latMin, latMax, lonMin, lonMax) => {
                const cLat = (latMin + latMax) / 2;
                const cLon = (lonMin + lonMax) / 2;
                setTargetCameraPos(latLonToVector3(cLat, cLon, 5.5));
              }}
              onInspectCoordinate={(lat, lon) => {
                setProbedCoord({ lat, lon });
                setTargetCameraPos(latLonToVector3(lat, lon, 4.8));
                loadProfileForLocation(lat, lon);
              }}
            />
          </Suspense>
        )}

        {/* Ocean Transect Vertical Cross-Section Modal */}
        {transectModalOpen && (
          <Suspense fallback={null}>
            <TransectModal
              initialLine={transectLine}
              timeIndex={timeIndex}
              onClose={() => setTransectModalOpen(false)}
            />
          </Suspense>
        )}

        {/* Global Search Modal (⌘K / Ctrl+K) */}
        {searchModalOpen && (
          <Suspense fallback={null}>
            <GlobalSearchModal
              isOpen={searchModalOpen}
              argoProfiles={argoProfiles}
              topAnomaly={anomalySummary?.highest_anomaly_float ?? null}
              onClose={() => setSearchModalOpen(false)}
              onSelectCoordinate={(lat, lon) => {
                setProbedCoord({ lat, lon });
                setTargetCameraPos(latLonToVector3(lat, lon, 4.8));
                loadProfileForLocation(lat, lon);
              }}
              onSelectArgo={handleSelectArgo}
              onSelectSector={handleSelectSector}
            />
          </Suspense>
        )}

        {/* Grounded Ocean Analyst AI Modal */}
        {aiModalOpen && (
          <Suspense fallback={null}>
            <AiAnalystModal
              isOpen={aiModalOpen}
              latitude={probedCoord?.lat ?? 14.5}
              longitude={probedCoord?.lon ?? 84.8}
              depth={depth}
              timeIndex={timeIndex}
              onClose={() => setAiModalOpen(false)}
              onTargetAnomaly={() => handleSelectSector('anomaly_target')}
            />
          </Suspense>
        )}

        {/* Command & Control Hotkeys Guide Modal */}
        {showHotkeys && (
          <div className="hotkeys-modal-overlay" onClick={() => setShowHotkeys(false)}>
            <div className="hotkeys-modal" onClick={(e) => e.stopPropagation()}>
              <div className="hotkeys-header">
                <span>⌨ COMMAND & CONTROL // SHORTCUT MATRIX</span>
                <button className="hotkeys-close-btn" onClick={() => setShowHotkeys(false)}>
                  ✕
                </button>
              </div>
              <div className="hotkeys-grid">
                <div className="hotkey-row">
                  <kbd>⌘K</kbd>
                  <span>Global Search (Regions, Floats, Coordinates)</span>
                </div>
                <div className="hotkey-row">
                  <kbd>Right-Click</kbd>
                  <span>Ocean Region Dossier (Contextual Telemetry)</span>
                </div>
                <div className="hotkey-row">
                  <kbd>P</kbd>
                  <span>Toggle Vertical Depth Profile HUD</span>
                </div>
                <div className="hotkey-row">
                  <kbd>T</kbd>
                  <span>Ocean Transect Subsurface Cross-Section</span>
                </div>
                <div className="hotkey-row">
                  <kbd>R</kbd>
                  <span>Draw & Analyze Geographic Region</span>
                </div>
                <div className="hotkey-row">
                  <kbd>A / I</kbd>
                  <span>Grounded Ocean Analyst AI</span>
                </div>
                <div className="hotkey-row">
                  <kbd>L</kbd>
                  <span>Toggle Persistent Left Layer Rail</span>
                </div>
                <div className="hotkey-row">
                  <kbd>C</kbd>
                  <span>Toggle 3D Current Vector Cones</span>
                </div>
                <div className="hotkey-row">
                  <kbd>4</kbd>
                  <span>Fly to the Top Live Model–Argo Divergence</span>
                </div>
                <div className="hotkey-row">
                  <kbd>Y</kbd>
                  <span>Cyclone Intelligence (Live GDACS + RI Backtests)</span>
                </div>
                <div className="hotkey-row">
                  <kbd>M</kbd>
                  <span>Model Trust (Depth Skill + Confidence Map)</span>
                </div>
                <div className="hotkey-row">
                  <kbd>ESC</kbd>
                  <span>Dismiss All Modals & Overlays</span>
                </div>
              </div>
              <div className="hotkeys-footer">
                Tip: Right-click anywhere in the ocean to inspect depth, salinity, currents, and model errors.
              </div>
            </div>
          </div>
        )}

        {/* SIH 2026 PS26067 Mission Briefing Modal */}
        {briefingOpen && (
          <Suspense fallback={null}>
            <MissionBriefingModal
              isOpen={briefingOpen}
              onClose={() => setBriefingOpen(false)}
              onJumpToAnomaly={() => handleSelectSector('anomaly_target')}
            />
          </Suspense>
        )}

        {/* Data Provenance & Scientific Methodology Modal */}
        {provenanceOpen && (
          <Suspense fallback={null}>
            <DataProvenanceModal
              isOpen={provenanceOpen}
              onClose={() => setProvenanceOpen(false)}
            />
          </Suspense>
        )}

        {/* SAGAR-VIEW Learn Mode Guided Journey */}
        {productMode === 'learn' && (
          <Suspense fallback={null}>
            <LearnStoryJourney
              onCameraFlyTo={handleCameraFlyTo}
              onClose={() => setProductMode('research')}
            />
          </Suspense>
        )}

        {/* SAGAR-VIEW Data Manager & CF-1.8 NetCDF Inspector */}
        {productMode === 'datamanager' && (
          <Suspense fallback={null}>
            <DataManagerModal
              onClose={() => setProductMode('research')}
            />
          </Suspense>
        )}

        {/* SAGAR-VIEW Spatial-Temporal Co-Location Engine */}
        {coLocationOpen && (
          <Suspense fallback={null}>
            <CoLocationModal
              isOpen={coLocationOpen}
              probedLat={probedCoord?.lat ?? 14.5}
              probedLon={probedCoord?.lon ?? 84.8}
              onClose={() => setCoLocationOpen(false)}
              onJumpToSensor={(lat, lon) => {
                handleCameraFlyTo(lat, lon, 4.4);
                setProbedCoord({ lat, lon });
                loadProfileForLocation(lat, lon);
                setCoLocationOpen(false);
              }}
            />
          </Suspense>
        )}

        {/* Core Differentiator: Model vs Reality Comparison Drawer */}
        {selectedProfileId && productMode !== 'sounding' && (
          <Suspense fallback={null}>
            <ComparisonPanel
              profileId={selectedProfileId}
              variable={variable}
              timeIndex={timeIndex}
              explainMode={explainMode}
              overrideStatus={platformStatusMap[selectedProfileId]}
              onClose={() => setSelectedProfileId(null)}
              onOpenFullPage={() => setProductMode('sounding')}
            />
          </Suspense>
        )}

        {/* SAGAR-VIEW Dedicated In-Situ Sounding Studio Workstation */}
        {productMode === 'sounding' && (
          <Suspense fallback={null}>
            <SoundingStudioPage
              initialProfileId={selectedProfileId}
              profiles={argoProfiles}
              variable={variable}
              timeIndex={timeIndex}
              platformStatus={platformStatusMap}
              onSelectProfile={(id) => setSelectedProfileId(id)}
              onVariableChange={setVariable}
              onClose={() => setProductMode('research')}
            />
          </Suspense>
        )}

        {/* Colorbar scale legend */}
        {showConfidence && confidenceSlice ? (
          <Colorbar
            variable="confidence"
            vMin={0}
            vMax={1}
            customLabel="Model confidence vs Argo (red = unverified / high error, green = verified)"
            customUnit="0–1"
          />
        ) : showTCHP && tchpSliceData ? (
          <Colorbar
            variable="tchp"
            vMin={0}
            vMax={tchpSliceData.vMax}
          />
        ) : sliceData ? (
          <Colorbar
            variable={variable}
            vMin={sliceData.vMin}
            vMax={sliceData.vMax}
          />
        ) : null}

        {/* TCHP & Marine Heatwave Inspection HUD Card */}
        {showTCHP && tchpPointData && (
          <Suspense fallback={null}>
            <TCHPInspectorCard
              data={tchpPointData}
              onClose={() => setTchpPointData(null)}
              onOpenTransect={() => {
                setTransectLine({
                  lat1: Math.max(0, tchpPointData.latitude - 3),
                  lon1: Math.max(60, tchpPointData.longitude - 3),
                  lat2: Math.min(28, tchpPointData.latitude + 3),
                  lon2: Math.min(100, tchpPointData.longitude + 3),
                });
                setTransectModalOpen(true);
              }}
            />
          </Suspense>
        )}


        {/* Zero-network 60 FPS in-memory Hover Sounding HUD with Citizen/Scientist dual-lens */}
        <HoverSounderHUD
          coordinate={hoverCoord}
          sliceData={sliceData}
          variable={variable}
          depth={depth}
          explainMode={explainMode}
        />

        {/* Cyclone Intelligence (live GDACS + Argo-only RI backtests) */}
        {cycloneModalOpen && (
          <Suspense fallback={null}>
            <CycloneIntelligenceModal
              isOpen={cycloneModalOpen}
              onClose={() => setCycloneModalOpen(false)}
              onShowStorm={(sid, lat, lon) => {
                setShowCyclones(true);
                setSelectedCycloneSid(sid);
                if (lat != null && lon != null) handleCameraFlyTo(lat, lon, 5.2);
              }}
            />
          </Suspense>
        )}

        {/* Live Weather Forecast Bottom Modal */}
        <WeatherForecastModal
          isOpen={showWeatherForecast}
          onClose={() => setShowWeatherForecast(false)}
          lat={22.2}
          lon={83.8}
        />

        {/* Model Trust (depth-band skill + spatial confidence) */}
        {trustModalOpen && (
          <Suspense fallback={null}>
            <ModelTrustModal
              isOpen={trustModalOpen}
              onClose={() => setTrustModalOpen(false)}
              confidence={confidenceField}
              showConfidence={showConfidence}
              onToggleConfidence={() => setShowConfidence((v) => !v)}
            />
          </Suspense>
        )}

        {/* Real-Time Live Ocean Telemetry & 72-Hour Prediction Modal */}
        {realtimeModalOpen && (
          <Suspense fallback={null}>
            <RealtimePredictionModal
              isOpen={realtimeModalOpen}
              onClose={() => setRealtimeModalOpen(false)}
              onFlyToLocation={(lat, lon) => {
                handleCameraFlyTo(lat, lon, 4.2);
                setProbedCoord({ lat, lon });
              }}
            />
          </Suspense>
        )}

        {/* Interactive Layman AI Ocean Guide Assistant */}
        <OceanGuideAgent
          isOpen={guideOpen}
          onToggle={() => setGuideOpen((prev) => !prev)}
          variable={variable}
          depth={depth}
          currentSector={currentSector}
          selectedProfileId={selectedProfileId}
          showCurrents={showCurrents}
          showTCHP={showTCHP}
          productMode={productMode}
          probedCoord={probedCoord}
          topAnomaly={anomalySummary?.highest_anomaly_float ?? null}
          onSetVariable={setVariable}
          onSetDepth={setDepth}
          onSelectSector={handleSelectSector}
          onToggleCurrents={() => setShowCurrents((v) => !v)}
          onToggleTCHP={() => {
            const next = !showTCHP;
            setShowTCHP(next);
            if (!next) setTchpPointData(null);
          }}
          onSelectArgo={handleSelectArgo}
          onSetProductMode={handleProductModeChange}
          onOpenTransect={() => setTransectModalOpen(true)}
          onOpenRealtime={() => setRealtimeModalOpen(true)}
        />

        {/* Error notification banner */}
        {error && (
          <div className="error-overlay">
            <span>⚠ {error}</span>
          </div>
        )}
      </main>

      {/* Bottom Timeline Animation & Ocean Controls */}
      <footer>
        {productMode !== 'operational' && (
          <TimeAnimator
            timeIndex={timeIndex}
            timeSteps={timeSteps}
            dates={dates}
            loading={sliceLoading}
            onTimeChange={setTimeIndex}
          />
        )}
        <ControlBar
          variable={variable}
          depth={depth}
          timeIndex={timeIndex}
          depthLevels={depthLevels}
          timeSteps={timeSteps}
          loading={totalLoading}
          showCurrents={showCurrents}
          onVariableChange={setVariable}
          onDepthChange={setDepth}
          onToggleCurrents={() => setShowCurrents((visible) => !visible)}
        />
      </footer>
    </div>
  );
}

export default App;
