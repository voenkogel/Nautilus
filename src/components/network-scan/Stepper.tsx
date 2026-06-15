import React from 'react';

interface StepperProps {
  currentPhase: string;
  accentColor: string;
}

/** Three-phase progress indicator for a network scan (discover → ports → web GUIs). */
export const Stepper: React.FC<StepperProps> = ({ currentPhase, accentColor }) => {
  const steps = [
    { id: 'ping', label: 'Discover Hosts', description: 'Finding active devices' },
    { id: 'port', label: 'Scan Ports', description: 'Identifying open ports' },
    { id: 'probe', label: 'Find Web GUIs', description: 'Detecting web interfaces' }
  ];

  const getStepStatus = (stepId: string) => {
    const stepIndex = steps.findIndex(step => step.id === stepId);
    const currentIndex = steps.findIndex(step => step.id === currentPhase);

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="mb-6">
      <div className="flex items-center w-full">
        {steps.map((step, index) => {
          const status = getStepStatus(step.id);
          return (
            <div key={step.id} className="flex items-center flex-1">
              {/* Step Circle */}
              <div className="flex flex-col items-center w-full">
                <div
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                    status === 'completed'
                      ? 'border-green-500 bg-green-500 text-white'
                      : status === 'active'
                      ? 'border-2 text-white'
                      : 'border-gray-300 bg-gray-100 text-gray-400'
                  }`}
                  style={{
                    borderColor: status === 'active' ? accentColor : undefined,
                    backgroundColor: status === 'active' ? accentColor : undefined,
                  }}
                >
                  {status === 'completed' ? (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : status === 'active' ? (
                    <svg className="animate-spin w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <circle className="opacity-0" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v2a6 6 0 00-6 6H4z" />
                    </svg>
                  ) : (
                    <span className="text-sm font-semibold">{index + 1}</span>
                  )}
                </div>
                <div className="text-center mt-2">
                  <div className={`text-sm font-semibold ${status === 'active' ? 'text-gray-800' : status === 'completed' ? 'text-green-600' : 'text-gray-400'}`}>
                    {step.label}
                  </div>
                  <div className={`text-xs ${status === 'active' ? 'text-gray-600' : 'text-gray-400'}`}>
                    {step.description}
                  </div>
                </div>
              </div>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="flex-1 h-0.5 mx-4 mt-5">
                  <div
                    className={`h-full transition-all duration-300 ${
                      getStepStatus(steps[index + 1].id) === 'completed' ||
                      (getStepStatus(steps[index + 1].id) === 'active' && status === 'completed')
                        ? 'bg-green-500'
                        : getStepStatus(steps[index + 1].id) === 'active'
                        ? 'bg-gray-300'
                        : 'bg-gray-300'
                    }`}
                    style={{
                      backgroundColor: getStepStatus(steps[index + 1].id) === 'active' && status === 'completed' ? accentColor : undefined
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Stepper;
