import React, { useState, useEffect, useRef } from 'react';
import { Bookmark, Save, Trash2, ChevronDown, Check, X } from 'lucide-react';

export interface SavedView {
  id: string;
  name: string;
  searchQuery: string;
  sortKey: string | null;
  sortDir: 'asc' | 'desc';
  selectedCategories: string[];
  selectedProductCategories: string[];
  selectedSubCategories: string[];
  selectedStatus: string[];
  columnOrder: string[];
  visibleColumns: string[];
}

interface SavedViewsSelectorProps {
  currentView: Omit<SavedView, 'id' | 'name'>;
  onApplyView: (view: SavedView) => void;
  storageKey?: string;
}

export function SavedViewsSelector({ currentView, onApplyView, storageKey = 'inventory_saved_views' }: SavedViewsSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setSavedViews(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Error loading saved views:', e);
    }
  }, [storageKey]);

  // Handle click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsSaving(false);
        setNewViewName('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when saving
  useEffect(() => {
    if (isSaving && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSaving]);

  const saveCurrentView = () => {
    if (!newViewName.trim()) return;
    
    const newView: SavedView = {
      id: Date.now().toString(),
      name: newViewName.trim(),
      ...currentView
    };

    const newViews = [...savedViews, newView];
    setSavedViews(newViews);
    localStorage.setItem(storageKey, JSON.stringify(newViews));
    
    setIsSaving(false);
    setNewViewName('');
  };

  const deleteView = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newViews = savedViews.filter(v => v.id !== id);
    setSavedViews(newViews);
    localStorage.setItem(storageKey, JSON.stringify(newViews));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveCurrentView();
    } else if (e.key === 'Escape') {
      setIsSaving(false);
      setNewViewName('');
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-transparent hover:bg-white/5 text-zinc-400 hover:text-white rounded-md text-[10px] font-black uppercase tracking-widest transition-all border border-white/10 h-[32px] sm:h-[34px]"
      >
        <Bookmark className="w-3.5 h-3.5" />
        VIEWS
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-card border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col">
          {/* List of saved views */}
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {savedViews.length === 0 ? (
              <div className="px-4 py-4 text-center text-[10px] font-bold text-zinc-500 uppercase">
                No saved views
              </div>
            ) : (
              savedViews.map((view) => (
                <div
                  key={view.id}
                  onClick={() => {
                    onApplyView(view);
                    setIsOpen(false);
                  }}
                  className="group flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer border-b border-white/5 last:border-0"
                >
                  <span className="text-[11px] font-bold text-zinc-300 group-hover:text-white truncate pr-2">
                    {view.name}
                  </span>
                  <button
                    onClick={(e) => deleteView(e, view.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 transition-all rounded hover:bg-white/5"
                    title="Delete view"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Save current view action */}
          <div className="border-t border-white/10 p-2 bg-black/20">
            {isSaving ? (
              <div className="flex items-center gap-2 px-2 py-1">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="VIEW NAME..."
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-brand-blue/50 placeholder:text-zinc-600 font-bold uppercase"
                />
                <button
                  onClick={saveCurrentView}
                  disabled={!newViewName.trim()}
                  className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded disabled:opacity-30 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setIsSaving(false);
                    setNewViewName('');
                  }}
                  className="p-1.5 text-zinc-400 hover:bg-white/10 rounded transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsSaving(true)}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 text-[10px] font-black text-brand-blue hover:text-brand-blue hover:bg-brand-blue/10 rounded-lg transition-colors uppercase tracking-widest"
              >
                <Save className="w-3.5 h-3.5" />
                SAVE CURRENT VIEW
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
