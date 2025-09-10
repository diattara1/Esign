import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react';

const variants = {
  success: {
    Icon: CheckCircle,
    container: 'bg-green-50 border-green-200 text-green-700',
    icon: 'text-green-500',
  },
  error: {
    Icon: XCircle,
    container: 'bg-red-50 border-red-200 text-red-700',
    icon: 'text-red-500',
  },
};

const Alert = ({ type = 'success', children }) => {
  const variant = variants[type] || variants.success;
  const { Icon, container, icon } = variant;

  return (
    <div className={`mb-4 p-3 border rounded-lg flex items-start space-x-2 text-sm ${container}`}>
      {Icon && <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${icon}`} />}
      <div className="flex-1">{children}</div>
    </div>
  );
};

export default Alert;
