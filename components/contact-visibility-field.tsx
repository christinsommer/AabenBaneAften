'use client';

import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

export function ContactVisibilityField({name, defaultChecked, label}: {
  name: 'emailVisible' | 'phoneVisible'; defaultChecked: boolean; label: string;
}) {
  return <div className="flex items-center gap-1">
    <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm whitespace-nowrap">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} aria-label={`${label}: Må vises`} className="size-4 accent-[#13375e]" />
      Må vises
    </label>
    <Popover><PopoverTrigger asChild><button type="button" aria-label={`Info om visning af ${label.toLowerCase()}`} className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#13375e] hover:bg-slate-100 focus-visible:outline-2">
      <Info className="size-4" aria-hidden="true" />
    </button></PopoverTrigger><PopoverContent className="max-w-[calc(100vw-2rem)] text-sm">Må vises til aabenbaneaften.dk medlemmer</PopoverContent></Popover>
  </div>;
}
