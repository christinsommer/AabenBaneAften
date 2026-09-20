// Redigér mailens emne og tekst her. {date} og {link} indsættes automatisk.
export const planEmailSubject = 'Kampplanen til Åben Bane Aften – {date}';
export const planEmailText = `Hej HIK-medlem

Kampplanen for {date} er nu klar.

Se dine kampe her:
{link}

Log ind med dit medlemsnummer og din PIN-kode, hvis du bliver bedt om det. Linket åbner Kampplan med “Vis kun mine kampe”.

Kontrollér dine kamptider, baner og medspillere. Hvis du står på venteliste eller ikke har fået en kamp, kan visningen være tom.

Hvis du bliver forhindret, bedes du følge reglerne om afbud og afløsere i appen.

Vi glæder os til at se dig på banen!

Venlig hilsen
Christin
Åben Bane Aften`;

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function planEmail(to:string,date:string) {
  const label=new Date(`${date}T12:00:00Z`).toLocaleDateString('da-DK',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Copenhagen'});
  const link=`https://aabenbaneaften.dk/?view=plan&mine=1&date=${encodeURIComponent(date)}`;
  const fill=(text:string)=>text.replaceAll('{date}',label).replaceAll('{link}',link);
  const text=fill(planEmailText);
  const html=escapeHtml(text).replace(escapeHtml(link),`<a href="${escapeHtml(link)}">Se mine kampe</a>`).split('\n\n').map(p=>`<p>${p.replaceAll('\n','<br>')}</p>`).join('');
  return {to,subject:fill(planEmailSubject),text,html};
}
