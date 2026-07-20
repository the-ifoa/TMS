import { useState } from 'react';
import { HiOutlineX, HiOutlineCheck } from 'react-icons/hi';

const ALL_MODULES = [
  'Air Law',
  'Aircraft Systems',
  'Navigation',
  'Meteorology',
  'Flight Planning',
  'Human Performance',
  'Mass & Balance',
  'Operational Procedures',
  'Communications',
  'Flight Monitoring',
  'Aircraft Performance',
  'Air Traffic Management',
  'Principles of Flight',
];

export default function ModuleSelector({ isOpen, onClose, onConfirm, initialModules = [] }) {
  const [selected, setSelected] = useState(
    initialModules.length > 0 ? initialModules : []
  );

  if (!isOpen) return null;

  const toggleModule = (mod) => {
    setSelected((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]
    );
  };

  const selectAll = () => setSelected([...ALL_MODULES]);
  const clearAll = () => setSelected([]);

  return (
    <>
      <div className="fixed -inset-20 bg-black/40 backdrop-blur-sm z-50 pointer-events-none" />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-slide-up" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-primary-200">
          <div>
            <h3 className="text-lg font-bold text-primary-800">Select Training Modules</h3>
            <p className="text-xs text-primary-400 mt-0.5">
              Choose modules completed during recurrent training
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-primary-100 transition-colors"
          >
            <HiOutlineX className="w-5 h-5 text-primary-400" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-6 pt-4">
          <button onClick={selectAll} className="text-xs font-medium text-accent-600 hover:text-accent-700">
            Select All
          </button>
          <span className="text-primary-300">|</span>
          <button onClick={clearAll} className="text-xs font-medium text-primary-400 hover:text-primary-600">
            Clear All
          </button>
          <span className="ml-auto text-xs text-primary-400">
            {selected.length} selected
          </span>
        </div>

        {/* Modules grid */}
        <div className="p-6 grid grid-cols-2 gap-2">
          {ALL_MODULES.map((mod) => (
            <button
              key={mod}
              onClick={() => toggleModule(mod)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-all duration-200 ${
                selected.includes(mod)
                  ? 'border-accent-400 bg-accent-50 text-accent-700 font-medium'
                  : 'border-primary-200 text-primary-600 hover:border-primary-300 hover:bg-primary-50'
              }`}
            >
              <div
                className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                  selected.includes(mod) ? 'bg-accent-500' : 'border border-primary-300'
                }`}
              >
                {selected.includes(mod) && (
                  <HiOutlineCheck className="w-3 h-3 text-white" />
                )}
              </div>
              {mod}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-primary-200 bg-primary-50/50 rounded-b-2xl">
          <button onClick={onClose} className="btn-outline">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selected)}
            disabled={selected.length === 0}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Generate Certificate
          </button>
        </div>
      </div>
    </div>
  </>
  );
}
