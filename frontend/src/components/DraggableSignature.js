import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { FiX, FiEdit3 } from 'react-icons/fi';

// Positions prédéfinies pour le mode "tap to place"
const PREDEFINED_POSITIONS = [
  { x: 0.1, y: 0.1 },
  { x: 0.7, y: 0.1 },
  { x: 0.1, y: 0.7 },
  { x: 0.7, y: 0.7 },
];

const DraggableSignature = React.memo(function DraggableSignature({
  field,
  pageWidth,
  pageHeight,
  isMobileView,
  onUpdate,
  onDelete,
  onOpenModal,
  image,
  tapToPlace = false,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, fieldX: 0, fieldY: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const elementRef = useRef(null);
  const dragMovedRef = useRef(false);
  const mouseDownBlockedRef = useRef(false);
  const [tapIndex, setTapIndex] = useState(0);

  const tapMode = isMobileView && tapToPlace;

  const style = useMemo(
    () => ({
      position: 'absolute',
      left: field.position.x * pageWidth,
      top: field.position.y * pageHeight,
      width: field.position.width * pageWidth,
      height: field.position.height * pageHeight,
      borderRadius: 8,
      boxShadow: '0 0 0 1px rgba(0,0,0,.20), 0 2px 6px rgba(0,0,0,.08)',
      background: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 15,
      cursor: tapMode ? 'pointer' : isDragging ? 'grabbing' : 'grab',
      border: '2px solid transparent',
      userSelect: 'none',
    }),
    [field.position, pageWidth, pageHeight, isDragging, tapMode]
  );

  const handleMouseDown = useCallback(
    (e) => {
      if (tapMode) return;
      const t = e.target;
      const blocked =
        t.classList?.contains('resize-handle') ||
        t.closest?.('.delete-handle') ||
        t.closest?.('.sig-open') ||
        t.closest?.('.edit-handle');
      mouseDownBlockedRef.current = !!blocked;
      if (blocked) return;
      e.preventDefault();
      e.stopPropagation();
      dragMovedRef.current = false;
      setIsDragging(true);
      setDragStart({
        x: e.clientX,
        y: e.clientY,
        fieldX: field.position.x,
        fieldY: field.position.y,
      });
    },
    [field.position, tapMode]
  );

  const handleTouchStart = useCallback(
    (e) => {
      if (tapMode) return;
      const t = e.target;
      const blocked =
        t.classList?.contains('resize-handle') ||
        t.closest?.('.delete-handle') ||
        t.closest?.('.sig-open') ||
        t.closest?.('.edit-handle');
      mouseDownBlockedRef.current = !!blocked;
      if (blocked) return;
      const touch = e.touches[0];
      if (!touch) return;
      e.preventDefault();
      e.stopPropagation();
      dragMovedRef.current = false;
      setIsDragging(true);
      setDragStart({
        x: touch.clientX,
        y: touch.clientY,
        fieldX: field.position.x,
        fieldY: field.position.y,
      });
    },
    [field.position, tapMode]
  );

  const handleResizeStart = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      mouseDownBlockedRef.current = true;
      setIsResizing(true);
      setResizeStart({
        x: e.clientX,
        y: e.clientY,
        width: field.position.width,
        height: field.position.height,
      });
    },
    [field.position]
  );

  const handleResizeTouchStart = useCallback(
    (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      e.preventDefault();
      e.stopPropagation();
      mouseDownBlockedRef.current = true;
      setIsResizing(true);
      setResizeStart({
        x: touch.clientX,
        y: touch.clientY,
        width: field.position.width,
        height: field.position.height,
      });
    },
    [field.position]
  );

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e) => {
      if (isDragging) {
        const deltaX = (e.clientX - dragStart.x) / pageWidth;
        const deltaY = (e.clientY - dragStart.y) / pageHeight;
        if (
          Math.abs(deltaX) > 3 / pageWidth ||
          Math.abs(deltaY) > 3 / pageHeight
        ) {
          dragMovedRef.current = true;
        }
        const newPosition = {
          ...field.position,
          x: Math.max(0, dragStart.fieldX + deltaX),
          y: Math.max(0, dragStart.fieldY + deltaY),
        };
        onUpdate(field, { position: newPosition });
      } else if (isResizing) {
        const deltaX = (e.clientX - resizeStart.x) / pageWidth;
        const deltaY = (e.clientY - resizeStart.y) / pageHeight;
        const newPosition = {
          ...field.position,
          width: Math.max(50 / pageWidth, resizeStart.width + deltaX),
          height: Math.max(20 / pageHeight, resizeStart.height + deltaY),
        };
        onUpdate(field, { position: newPosition });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    const handleTouchMove = (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      e.preventDefault();
      if (isDragging) {
        const deltaX = (touch.clientX - dragStart.x) / pageWidth;
        const deltaY = (touch.clientY - dragStart.y) / pageHeight;
        if (
          Math.abs(deltaX) > 3 / pageWidth ||
          Math.abs(deltaY) > 3 / pageHeight
        ) {
          dragMovedRef.current = true;
        }
        const newPosition = {
          ...field.position,
          x: Math.max(0, dragStart.fieldX + deltaX),
          y: Math.max(0, dragStart.fieldY + deltaY),
        };
        onUpdate(field, { position: newPosition });
      } else if (isResizing) {
        const deltaX = (touch.clientX - resizeStart.x) / pageWidth;
        const deltaY = (touch.clientY - resizeStart.y) / pageHeight;
        const newPosition = {
          ...field.position,
          width: Math.max(50 / pageWidth, resizeStart.width + deltaX),
          height: Math.max(20 / pageHeight, resizeStart.height + deltaY),
        };
        onUpdate(field, { position: newPosition });
      }
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [
    isDragging,
    isResizing,
    dragStart,
    resizeStart,
    pageWidth,
    pageHeight,
    field,
    onUpdate,
  ]);

  const handleClickToOpen = useCallback(() => {
    if (mouseDownBlockedRef.current) {
      mouseDownBlockedRef.current = false;
      return;
    }
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    onOpenModal?.();
  }, [onOpenModal]);

  const handleTap = useCallback(
    (e) => {
      const t = e.target;
      if (
        t.classList?.contains('resize-handle') ||
        t.closest?.('.delete-handle') ||
        t.closest?.('.sig-open') ||
        t.closest?.('.edit-handle')
      ) {
        return;
      }
      const nextIndex = (tapIndex + 1) % PREDEFINED_POSITIONS.length;
      setTapIndex(nextIndex);
      const pos = PREDEFINED_POSITIONS[nextIndex];
      onUpdate(field, {
        position: {
          ...field.position,
          x: pos.x,
          y: pos.y,
        },
      });
    },
    [tapIndex, field, onUpdate]
  );

  return (
    <div
      ref={elementRef}
      style={style}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={(e) => e.preventDefault()}
      onTouchEnd={(e) => e.preventDefault()}
      onClick={tapMode ? handleTap : image && onOpenModal ? handleClickToOpen : undefined}
      className={`signature-field ${isDragging ? 'dragging' : ''} hover:shadow-lg transition-shadow`}
      title={
        tapMode
          ? 'Appuyer pour déplacer'
          : image && onOpenModal
          ? 'Cliquer pour modifier la signature'
          : undefined
      }
    >
      {image ? (
        <img
          src={image}
          alt="signature"
          className="max-w-full max-h-full object-contain"
          draggable={false}
        />
      ) : onOpenModal ? (
        <div
          className="sig-open px-3 py-1 text-xs font-semibold text-white bg-emerald-600 rounded shadow cursor-pointer select-none"
          onClick={(e) => {
            e.stopPropagation();
            onOpenModal?.();
          }}
          title="Cliquer pour signer"
          role="button"
          aria-label="Ouvrir le modal de signature"
        >
          Cliquer pour signer
        </div>
      ) : (
        <div
          style={{
            textAlign: 'center',
            fontSize: isMobileView ? 10 : 12,
            lineHeight: 1.1,
            color: '#374151',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Signature</div>
          <div>
            {field.recipient_name || field.name?.replace('Signature ', '')}
          </div>
        </div>
      )}

      {tapMode && image && onOpenModal && (
        <button
          className="edit-handle absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-blue-600"
          onClick={(e) => {
            e.stopPropagation();
            onOpenModal();
          }}
          title="Modifier la signature"
        >
          <FiEdit3 className="w-3 h-3" />
        </button>
      )}

      <div
        className="resize-handle"
        onMouseDown={handleResizeStart}
        onTouchStart={handleResizeTouchStart}
        style={{
          position: 'absolute',
          bottom: -4,
          right: -4,
          width: 12,
          height: 12,
          background: '#3b82f6',
          borderRadius: '50%',
          cursor: 'se-resize',
          border: '2px solid white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        }}
      />

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(field);
        }}
        className="delete-handle absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
        title="Supprimer la zone"
      >
        <FiX className="w-3 h-3" />
      </button>
    </div>
  );
});

export default DraggableSignature;

