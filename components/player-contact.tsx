'use client';

import { ContactRound, Mail, Phone } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

export type PlanContact = { id: number; name: string; email?: string | null; phone?: string | null; phoneCountryCode?: string | null };

export function contactByName(name: string, contacts: PlanContact[]) {
  const normalize = (text: string) => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('da-DK');
  const found = contacts.filter(person => normalize(person.name) === normalize(name));
  return found.length === 1 ? found[0] : undefined;
}

export function PlayerContact({ name, contact }: { name: string; contact?: PlanContact }) {
  const phone = contact?.phone?.trim();
  const email = contact?.email?.trim();
  const number = phone ? (phone.startsWith('+') || phone.startsWith('00') ? phone : `${contact?.phoneCountryCode || '+45'}${phone}`).replace(/[\s().-]/g, '') : '';
  return <span className="inline-flex max-w-full items-center gap-0.5 align-middle">
    <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
    {(phone || email) && <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Kontakt ${name}`} title={`Kontakt ${name}`} className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[#13375e] hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13375e] print:hidden">
          <ContactRound className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent collisionPadding={12} className="w-72 max-w-[calc(100vw-24px)] p-2" aria-label={`Kontakt ${name}`}>
        <p className="px-2 py-2 text-sm font-semibold [overflow-wrap:anywhere]">{name}</p>
        {phone && <a href={`tel:${number}`} className="flex min-h-12 items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-100 focus-visible:outline-2">
          <Phone className="size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 text-sm">Ring<span className="block text-xs text-slate-500 [overflow-wrap:anywhere]">{number}</span></span>
        </a>}
        {email && <a href={`mailto:${encodeURIComponent(email)}`} className="flex min-h-12 items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-100 focus-visible:outline-2">
          <Mail className="size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 text-sm">Send e-mail<span className="block text-xs text-slate-500 [overflow-wrap:anywhere]">{email}</span></span>
        </a>}
      </PopoverContent>
    </Popover>}
  </span>;
}
