import React from 'react';

const LoadingSkeleton = () => (
  <div className="min-h-screen flex items-center justify-center p-4" data-testid="loading-skeleton">
    <div className="w-full max-w-sm space-y-4 animate-pulse">
      <div className="h-4 bg-gray-300 rounded"></div>
      <div className="h-4 bg-gray-300 rounded"></div>
      <div className="h-4 bg-gray-300 rounded"></div>
    </div>
  </div>
);

export default LoadingSkeleton;
