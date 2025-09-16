import React, { useState, useRef, useEffect } from 'react';

const CustomDatePicker = ({ value, onChange, min, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(value ? new Date(value) : null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const dropdownRef = useRef(null);

  const months = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  const weekDays = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const generateCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(firstDay.getDate() - firstDay.getDay());

    const days = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const formatDisplayDate = (date) => {
    if (!date) return 'Sélectionner une date';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const handleDateSelect = (date) => {
    const newDate = new Date(date);
    if (selectedDate) {
      newDate.setHours(selectedDate.getHours(), selectedDate.getMinutes());
    } else {
      newDate.setHours(12, 0);
    }
    
    setSelectedDate(newDate);
    const isoString = newDate.toISOString().slice(0, 16);
    onChange({ target: { value: isoString } });
  };

  const handleTimeChange = (field, value) => {
    const newDate = new Date(selectedDate || new Date());
    if (field === 'hour') newDate.setHours(parseInt(value));
    if (field === 'minute') newDate.setMinutes(parseInt(value));
    
    setSelectedDate(newDate);
    const isoString = newDate.toISOString().slice(0, 16);
    onChange({ target: { value: isoString } });
  };

  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date) => {
    return selectedDate && date.toDateString() === selectedDate.toDateString();
  };

  const isInCurrentMonth = (date) => {
    return date.getMonth() === currentMonth.getMonth();
  };

  const isPastDate = (date) => {
    if (!min) return false;
    return date < new Date(min);
  };

  const days = generateCalendar();

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-14 px-4 bg-white border-0 rounded-xl text-base font-medium text-gray-900 shadow-inner focus:ring-2 focus:ring-violet-400 focus:outline-none text-left flex items-center justify-between"
        style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.06)'
        }}
      >
        <span className={selectedDate ? 'text-gray-900' : 'text-gray-500'}>
          {formatDisplayDate(selectedDate)}
        </span>
        <svg 
          className={`w-5 h-5 text-violet-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
          fill="currentColor" 
          viewBox="0 0 20 20"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 z-50 w-80">
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>
            
            <h3 className="font-semibold text-gray-900 text-lg">
              {months[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </h3>
            
            <button
              type="button"
              onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-3">
            {weekDays.map(day => (
              <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2 mb-6">
            {days.map((date, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleDateSelect(date)}
                disabled={isPastDate(date)}
                className={`
                  w-10 h-10 text-sm rounded-lg transition-all duration-150 relative flex items-center justify-center
                  ${isSelected(date) 
                    ? 'bg-violet-500 text-white shadow-lg' 
                    : isToday(date)
                    ? 'bg-violet-100 text-violet-700 font-semibold'
                    : isInCurrentMonth(date)
                    ? 'hover:bg-gray-100 text-gray-900'
                    : 'text-gray-400 hover:bg-gray-50'
                  }
                  ${isPastDate(date) ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {date.getDate()}
                {isToday(date) && !isSelected(date) && (
                  <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-violet-500 rounded-full" />
                )}
              </button>
            ))}
          </div>

          {selectedDate && (
            <div className="border-t pt-4">
              <div className="flex items-center justify-center space-x-4">
                <div className="flex items-center space-x-2">
                  <select
                    value={selectedDate.getHours()}
                    onChange={(e) => handleTimeChange('hour', e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                    ))}
                  </select>
                  <span className="text-gray-500">:</span>
                  <select
                    value={selectedDate.getMinutes()}
                    onChange={(e) => handleTimeChange('minute', e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
                  >
                    {Array.from({ length: 60 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2 mt-4 pt-4 border-t">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 text-sm bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
            >
              Valider
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomDatePicker;