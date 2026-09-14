'use client';

import { CalendarDays } from 'lucide-react';
import { Button } from './ui/button';
import { createMatchCalendar, type CalendarMatch } from '../lib/match-calendar';

export function MatchCalendarButton({ match }: { match: CalendarMatch }) {
  function addToCalendar() {
    const url = URL.createObjectURL(new Blob([createMatchCalendar(match)], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `hik-kamp-${match.date}-${match.startTime.replace(/[:.]/g, '')}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return <Button type="button" variant="outline" size="icon" onClick={addToCalendar}
    title="Tilføj til din kalender" aria-label={`Tilføj kampen kl. ${match.startTime} på bane ${String(match.court).match(/\d+/)?.[0] ?? match.court} til din kalender`}>
    <CalendarDays aria-hidden="true" />
  </Button>;
}
