import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '../lib/utils';
import { Search, Command, ArrowRight, File, Settings, Zap } from 'lucide-react';

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  icon?: React.ReactNode;
  category?: string;
  action: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
  placeholder?: string;
}

export function CommandPalette({
  open,
  onOpenChange,
  items,
  placeholder = 'Type a command or search...',
}: CommandPaletteProps) {
  const [search, setSearch] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Filter items based on search
  const filteredItems = React.useMemo(() => {
    if (!search) return items;

    const lower = search.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(lower) ||
        item.description?.toLowerCase().includes(lower) ||
        item.category?.toLowerCase().includes(lower)
    );
  }, [items, search]);

  // Group items by category
  const groupedItems = React.useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};

    for (const item of filteredItems) {
      const category = item.category || 'Actions';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(item);
    }

    return groups;
  }, [filteredItems]);

  // Reset on open
  React.useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filteredItems[selectedIndex];
      if (item) {
        item.action();
        onOpenChange(false);
      }
    } else if (e.key === 'Escape') {
      onOpenChange(false);
    }
  };

  let currentIndex = 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[20%] z-50 w-full max-w-xl translate-x-[-50%] rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-zinc-800 px-4">
            <Search className="h-5 w-5 text-zinc-500" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder={placeholder}
              className="flex-1 bg-transparent py-4 text-sm text-zinc-100 placeholder-zinc-500 outline-none"
            />
            <kbd className="hidden sm:flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-400">
              <Command className="h-3 w-3" />K
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[300px] overflow-y-auto p-2">
            {filteredItems.length === 0 ? (
              <div className="py-6 text-center text-sm text-zinc-500">
                No results found
              </div>
            ) : (
              Object.entries(groupedItems).map(([category, categoryItems]) => (
                <div key={category}>
                  <div className="px-2 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    {category}
                  </div>
                  {categoryItems.map((item) => {
                    const index = currentIndex++;
                    const isSelected = index === selectedIndex;

                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          item.action();
                          onOpenChange(false);
                        }}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                          isSelected ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
                        )}
                      >
                        {/* Icon */}
                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-700/50">
                          {item.icon || <Zap className="h-4 w-4 text-zinc-400" />}
                        </span>

                        {/* Label and description */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-zinc-100">{item.label}</div>
                          {item.description && (
                            <div className="text-xs text-zinc-500 truncate">
                              {item.description}
                            </div>
                          )}
                        </div>

                        {/* Shortcut */}
                        {item.shortcut && (
                          <kbd className="text-xs text-zinc-500 bg-zinc-800 px-2 py-1 rounded">
                            {item.shortcut}
                          </kbd>
                        )}

                        {/* Arrow */}
                        {isSelected && (
                          <ArrowRight className="h-4 w-4 text-zinc-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded">↑↓</kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded">↵</kbd>
                Select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded">esc</kbd>
                Close
              </span>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export { CommandPalette };
