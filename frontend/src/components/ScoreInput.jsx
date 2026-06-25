import { useState, useEffect } from 'react';
import { HiOutlineX } from 'react-icons/hi';

export default function ScoreInput({ isOpen, onClose, onConfirm, initialScore = null }) {
  const [score, setScore] = useState(initialScore || '');
  const [error, setError] = useState('');

  useEffect(() => {
    setScore(initialScore || '');
    setError('');
  }, [isOpen, initialScore]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    const numScore = Number(score);
    if (score === '' || isNaN(numScore) || numScore < 0 || numScore > 100) {
      setError('Please enter a valid score between 0 and 100');
      return;
    }
    onConfirm(numScore);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleConfirm();
  };

  return (
    <>
      <div className="fixed -inset-20 bg-black/40 backdrop-blur-sm z-50 pointer-events-none" />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-slide-up" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-primary-200">
          <div>
            <h3 className="text-lg font-bold text-primary-800">Enter NDG Score</h3>
            <p className="text-xs text-primary-400 mt-0.5">
              Enter the training score (0-100%)
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-primary-100 transition-colors"
          >
            <HiOutlineX className="w-5 h-5 text-primary-400" />
          </button>
        </div>

        {/* Score Input */}
        <div className="p-6 space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-sm font-medium text-primary-700 mb-2">
                Score
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={score}
                onChange={(e) => {
                  setScore(e.target.value);
                  setError('');
                }}
                onKeyPress={handleKeyPress}
                placeholder="90"
                className="w-full px-4 py-2.5 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent text-primary-800 placeholder-primary-300"
                autoFocus
              />
            </div>
            <span className="text-xl font-semibold text-primary-600 mb-2">%</span>
          </div>
          
          {error && (
            <div className="px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs font-medium text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-primary-200 bg-primary-50/50 rounded-b-2xl">
          <button onClick={onClose} className="btn-outline">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="btn-primary"
          >
            Generate Certificate
          </button>
        </div>
      </div>
    </>
  );
}
