import React, { useState } from 'react';
import { Bot, Droplets, Flame, Waves, GraduationCap, Lightbulb } from 'lucide-react';
import './LearnStoryJourney.css';

interface LearnStoryJourneyProps {
  onCameraFlyTo: (lat: number, lon: number, altitude?: number) => void;
  onClose: () => void;
}

const JOURNEY_STEPS = [
  {
    id: 1,
    Icon: Bot,
    title: 'The Robotic Argo Network',
    subtitle: 'How autonomous floats profile the deep ocean every 10 days',
    description: 'India deploys Argo profiling floats across the Indian Ocean through INCOIS. Each float dives to 2000m, measuring temperature and salinity as it ascends. This creates a 4D picture of the ocean\'s interior that no satellite can see.',
    camera: { lat: 14.5, lon: 84.8, alt: 4.6 },
    highlight: 'Look for the cyan markers — each one is a real Argo float position.',
  },
  {
    id: 2,
    Icon: Droplets,
    title: 'Bay of Bengal Freshwater Lens',
    subtitle: 'Why salinity controls monsoon intensity',
    description: 'The Bay of Bengal receives massive freshwater input from the Ganges, Brahmaputra, and Irrawaddy rivers. This creates a thin, low-salinity "barrier layer" on the surface that traps heat underneath — intensifying cyclones that pass over it.',
    camera: { lat: 18.0, lon: 89.0, alt: 4.2 },
    highlight: 'Switch to Salinity (PSU) variable to see the freshwater lens in the northern Bay.',
  },
  {
    id: 3,
    Icon: Flame,
    title: 'Hidden Subsurface Heatwaves',
    subtitle: 'When the ocean hides dangerous heat below the surface',
    description: 'Marine heatwaves can be invisible from space. SAGAR VIEW compares model predictions with Argo observations to detect when reality diverges from the forecast — revealing trapped subsurface heat that satellites miss entirely.',
    camera: { lat: 14.5, lon: 84.8, alt: 3.8 },
    highlight: 'The fleet analysis detects subsurface heatwaves by comparing Argo observations against the live ocean model — press 4 to jump to the worst one live.',
  },
  {
    id: 4,
    Icon: Waves,
    title: 'Monsoon Ocean Currents',
    subtitle: 'The ocean highways that drive Indian weather',
    description: 'The Indian Ocean has the world\'s only seasonally reversing current system. During the southwest monsoon, the Somali Current and East India Coastal Current transport warm water that fuels rainfall across the subcontinent.',
    camera: { lat: 8.0, lon: 76.0, alt: 5.0 },
    highlight: 'Press C to toggle 3D current vectors and see the monsoon circulation pattern.',
  },
];

export const LearnStoryJourney: React.FC<LearnStoryJourneyProps> = ({
  onCameraFlyTo,
  onClose,
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const step = JOURNEY_STEPS[activeStep];

  const goToStep = (index: number) => {
    setActiveStep(index);
    const s = JOURNEY_STEPS[index];
    onCameraFlyTo(s.camera.lat, s.camera.lon, s.camera.alt);
  };

  return (
    <div className="learn-journey-overlay">
      <div className="learn-journey-card">
        <div className="lj-header">
          <div className="lj-title-group">
            <span className="lj-badge">
              <GraduationCap size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              LEARN MODE
            </span>
            <span className="lj-progress">Step {activeStep + 1} of {JOURNEY_STEPS.length}</span>
          </div>
          <button className="lj-close-btn" onClick={onClose} title="Exit Learn Mode">✕</button>
        </div>

        <div className="lj-step-indicators">
          {JOURNEY_STEPS.map((s, i) => {
            const StepIcon = s.Icon;
            return (
              <button
                key={s.id}
                className={`lj-step-dot ${i === activeStep ? 'active' : ''} ${i < activeStep ? 'completed' : ''}`}
                onClick={() => goToStep(i)}
                title={s.title}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <StepIcon size={14} />
              </button>
            );
          })}
        </div>

        <div className="lj-content">
          <div className="lj-step-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <step.Icon size={28} />
          </div>
          <h3 className="lj-step-title">{step.title}</h3>
          <p className="lj-step-subtitle">{step.subtitle}</p>
          <p className="lj-step-description">{step.description}</p>
          <div className="lj-highlight">
            <span className="lj-highlight-icon"><Lightbulb size={14} /></span>
            <span>{step.highlight}</span>
          </div>
        </div>

        <div className="lj-nav">
          <button
            className="lj-nav-btn prev"
            disabled={activeStep === 0}
            onClick={() => goToStep(activeStep - 1)}
          >
            ← Previous
          </button>
          <button
            className="lj-nav-btn next"
            onClick={() => {
              if (activeStep < JOURNEY_STEPS.length - 1) {
                goToStep(activeStep + 1);
              } else {
                onClose();
              }
            }}
          >
            {activeStep < JOURNEY_STEPS.length - 1 ? 'Next →' : 'Finish ✓'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LearnStoryJourney;
