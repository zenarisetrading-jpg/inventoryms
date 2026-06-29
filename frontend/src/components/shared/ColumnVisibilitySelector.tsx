import React, { useState, useRef, useEffect } from 'react';
import { Columns, Search, GripVertical, Check, RefreshCw } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface ColumnItem {
  key: string;
  label: string;
}

interface ColumnVisibilitySelectorProps {
  columns: ColumnItem[];
  visibleColumns: string[];
  onToggle: (key: string) => void;
  onReorder: (columns: ColumnItem[]) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onReset: () => void;
}

interface SortableItemProps {
  item: ColumnItem;
  isVisible: boolean;
  onToggle: (key: string) => void;
}

function SortableItem({ item, isVisible, onToggle }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 py-2 px-3 hover:bg-white/5 rounded-lg transition-colors bg-[#0B0F1A] border border-transparent ${
        isDragging ? 'border-brand-amber/50 shadow-xl' : ''
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab hover:text-white text-zinc-500 touch-none flex-shrink-0"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <label className="flex items-center gap-3 flex-1 cursor-pointer min-w-0">
        <div className="relative flex items-center justify-center flex-shrink-0">
          <input
            type="checkbox"
            checked={isVisible}
            onChange={() => onToggle(item.key)}
            className="peer sr-only"
          />
          <div className="w-4 h-4 border border-zinc-600 rounded bg-white/5 peer-checked:bg-brand-blue peer-checked:border-brand-blue transition-all flex items-center justify-center">
            <Check className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
          </div>
        </div>
        <span className={`text-xs font-semibold uppercase truncate ${isVisible ? 'text-zinc-200' : 'text-zinc-500'}`}>
          {item.label}
        </span>
      </label>
    </div>
  );
}

export function ColumnVisibilitySelector({
  columns,
  visibleColumns,
  onToggle,
  onReorder,
  onSelectAll,
  onClearAll,
  onReset,
}: ColumnVisibilitySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = columns.findIndex((c) => c.key === active.id);
      const newIndex = columns.findIndex((c) => c.key === over.id);
      onReorder(arrayMove(columns, oldIndex, newIndex));
    }
  };

  const filteredColumns = columns.filter((col) =>
    col.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-transparent border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white rounded-md text-[10px] font-black uppercase tracking-widest transition-all h-[32px] sm:h-[34px]"
      >
        <Columns className="w-3.5 h-3.5" />
        Columns
        {visibleColumns.length < columns.length && (
          <span className="ml-1 px-1.5 py-0.5 rounded bg-brand-blue/20 text-brand-blue text-[9px] leading-none">
            {visibleColumns.length}/{columns.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-white/10 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden max-h-[70vh]">
          <div className="p-3 border-b border-white/5 space-y-3">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Find column..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-brand-blue/50 transition-colors placeholder:text-zinc-600"
              />
            </div>
            <div className="flex items-center justify-between gap-2 px-1">
              <button onClick={onSelectAll} className="text-[10px] font-bold text-brand-blue hover:text-brand-blue/80 uppercase transition-colors">
                All
              </button>
              <button onClick={onClearAll} className="text-[10px] font-bold text-zinc-400 hover:text-zinc-300 uppercase transition-colors">
                Clear
              </button>
              <button onClick={onReset} className="text-[10px] font-bold text-amber-500 hover:text-amber-400 uppercase flex items-center gap-1 ml-auto transition-colors">
                <RefreshCw className="w-3 h-3" /> Reset
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-[100px]">
            {filteredColumns.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500">No columns found</div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={filteredColumns.map(c => c.key)} strategy={verticalListSortingStrategy}>
                  {filteredColumns.map((col) => (
                    <SortableItem
                      key={col.key}
                      item={col}
                      isVisible={visibleColumns.includes(col.key)}
                      onToggle={onToggle}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
