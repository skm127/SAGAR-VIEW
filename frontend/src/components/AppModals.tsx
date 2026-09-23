import React, { lazy, Suspense } from 'react';
import { useUIStore } from '../store/uiStore';
import { useOceanData } from '../hooks/useOceanData';
import { useArgoData } from '../hooks/useArgoData';

const ComparisonPanel = lazy(() => import('./Panels/ComparisonPanel'));
const MissionBriefingModal = lazy(() => import('./Panels/MissionBriefingModal'));
const DataProvenanceModal = lazy(() => import('./Panels/DataProvenanceModal'));
const CoLocationModal = lazy(() => import('./Panels/CoLocationModal'));
const RealtimePredictionModal = lazy(() => import('./Panels/RealtimePredictionModal'));

export const AppModals: React.FC<any> = (props) => {
  const ui = useUIStore();
  const { variable, timeIndex } = useOceanData();
  const { selectedProfileId, setSelectedProfileId } = useArgoData();

  return (
    <>
      {ui.briefingOpen && (
        <Suspense fallback={null}>
          <MissionBriefingModal
            isOpen={ui.briefingOpen}
            onClose={() => ui.setBriefingOpen(false)}
            onJumpToAnomaly={() => props.handleSelectSector('anomaly_target')}
          />
        </Suspense>
      )}

      {ui.provenanceOpen && (
        <Suspense fallback={null}>
          <DataProvenanceModal
            isOpen={ui.provenanceOpen}
            onClose={() => ui.setProvenanceOpen(false)}
          />
        </Suspense>
      )}

      {ui.coLocationOpen && (
        <Suspense fallback={null}>
          <CoLocationModal
            isOpen={ui.coLocationOpen}
            probedLat={props.probedCoord?.lat ?? 14.5}
            probedLon={props.probedCoord?.lon ?? 84.8}
            onClose={() => ui.setCoLocationOpen(false)}
            onJumpToSensor={(lat: number, lon: number) => {
              props.handleCameraFlyTo(lat, lon, 4.4);
              props.setProbedCoord({ lat, lon });
              props.loadProfileForLocation(lat, lon);
              ui.setCoLocationOpen(false);
            }}
          />
        </Suspense>
      )}

      {selectedProfileId && ui.productMode !== 'sounding' && (
        <Suspense fallback={null}>
          <ComparisonPanel
            profileId={selectedProfileId}
            variable={variable}
            timeIndex={timeIndex}
            explainMode={ui.explainMode}
            onClose={() => setSelectedProfileId(null)}
            onOpenFullPage={() => ui.setProductMode('sounding')}
          />
        </Suspense>
      )}

      {ui.realtimeModalOpen && (
        <Suspense fallback={null}>
          <RealtimePredictionModal
            isOpen={ui.realtimeModalOpen}
            onClose={() => ui.setRealtimeModalOpen(false)}
            onFlyToLocation={(lat: number, lon: number) => {
              props.handleCameraFlyTo(lat, lon, 4.2);
              props.setProbedCoord({ lat, lon });
            }}
          />
        </Suspense>
      )}
    </>
  );
};
