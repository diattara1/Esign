import React from 'react';
import { FiInbox } from 'react-icons/fi';

const EmptyState = ({ message, actionLabel, onAction, icon: Icon = FiInbox }) => {
  return (
    <div className="text-center py-10 px-4">
      <Icon className="mx-auto h-12 w-12 text-gray-400" />
      {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}
      {actionLabel && onAction && (
        <div className="mt-6">
          <button
            onClick={onAction}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none"
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
};

export default EmptyState;
