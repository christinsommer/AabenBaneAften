export type CalendarPlayer = { name: string; firstName?: string | null };
export type CalendarMatch = {
  date: string;
  startTime: string;
  endTime?: string;
  court: string | number;
  players: (string | CalendarPlayer)[];
};

const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function matchTime(date: string, time: string) {
  const local = new Date(`${date}T${time.replace('.', ':').padStart(5, '0')}:00Z`);
  const offset = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Copenhagen', timeZoneName: 'longOffset',
  }).formatToParts(local).find(part => part.type === 'timeZoneName')!.value;
  const [, sign, hours, minutes] = offset.match(/GMT([+-])(\d{2}):(\d{2})/)!;
  return new Date(local.getTime() - (sign === '+' ? 1 : -1) * (Number(hours) * 60 + Number(minutes)) * 60_000);
}

// RFC 5545 folds content lines at 75 UTF-8 octets, without splitting characters.
function foldLine(line: string) {
  const encoder = new TextEncoder();
  let result = '', length = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (length + bytes > 75) { result += '\r\n '; length = 1; }
    result += character;
    length += bytes;
  }
  return result;
}

export function createMatchCalendar(match: CalendarMatch, now = new Date()) {
  const firstNames = match.players.map(player => typeof player === 'string'
    ? player.trim().split(/\s+/)[0]
    : player.firstName?.trim() || player.name.trim().split(/\s+/)[0]);
  const singleNames = firstNames.filter(Boolean);
  const title = singleNames.length === 2 ? `${singleNames[0]} vs ${singleNames[1]}` : `${firstNames[0]} & ${firstNames[1]} vs ${firstNames[2]} & ${firstNames[3]}`;
  const court = String(match.court).match(/\d+/)?.[0] ?? String(match.court);
  const weekday = new Date(`${match.date}T12:00:00Z`).getUTCDay();
  const location = `${weekday === 5 ? 'Indendørs ' : weekday === 3 ? 'Udendørs ' : ''}Bane #${court}`;
  const start = matchTime(match.date, match.startTime);
  const end = match.endTime ? matchTime(match.date, match.endTime) : new Date(start.getTime() + 60 * 60_000);
  if (end <= start) end.setUTCDate(end.getUTCDate() + 1);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HIK//Aaben Bane//DA', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${stamp(start)}-court-${court}@aabenbane.hik`,
    `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(title)}`, `LOCATION:${escapeText(location)}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].map(foldLine).join('\r\n');
}
