// frontend/src/components/HistoryList.tsx
import React from 'react';
import { makeAbsoluteUrl } from '../utils/makeAbsoluteUrl';

export default function HistoryList({
  items,
  onRestore
}: {
  items: any[];
  onRestore: (item: any) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 mt-4">
      {items.map((it) => {
        const src = makeAbsoluteUrl(it.imageUrl) ?? localStorage.getItem('imagegen:lastUpload');
        return (
          <button
            key={it.id}
            onClick={() => onRestore(it)}
            className="flex items-center border p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {src ? (
              <img
                src={src}
                alt={it.prompt || 'Generation thumbnail'}
                className="w-16 h-16 object-cover mr-2 rounded"
                onError={(e) => {
                  // fallback to placeholder if loading fails
                  (e.currentTarget as HTMLImageElement).src = '/assets/placeholder-thumb.svg';
                }}
              />
            ) : (
              <div className="w-16 h-16 mr-2 rounded bg-gray-100 flex items-center justify-center text-xs text-[var(--muted)]">
                No image
              </div>
            )}
            <div className="text-left">
              <div className="font-semibold">{it.prompt}</div>
              <div className="text-xs text-gray-500">{new Date(it.createdAt).toLocaleString()}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
