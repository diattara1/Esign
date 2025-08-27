import React from 'react';

const strengthLevels = [
  { label: 'Très faible', color: 'bg-red-500' },
  { label: 'Faible', color: 'bg-orange-500' },
  { label: 'Moyen', color: 'bg-yellow-500' },
  { label: 'Fort', color: 'bg-green-500' },
];

const getStrengthScore = (password) => {
  let score = 0;
  if (!password) return score;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
};

const PasswordStrengthIndicator = ({ password }) => {
  const score = getStrengthScore(password);
  const width = `${(score / 4) * 100}%`;
  const level = strengthLevels[score - 1];

  return (
    <div className="mt-2">
      <div className="h-2 w-full bg-gray-200 rounded">
        <div
          className={`h-full rounded ${level ? level.color : ''}`}
          style={{ width }}
        />
      </div>
      {level && (
        <p className="mt-1 text-xs text-gray-600">Force: {level.label}</p>
      )}
    </div>
  );
};

export default PasswordStrengthIndicator;
