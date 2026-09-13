import test from 'node:test';
import assert from 'node:assert/strict';
import { welcomeEmail, sendWelcomeEmail } from '../lib/welcome-email.ts';

test('welcome email uses the requested recipient, subject, text and bold domain', async () => {
  const expected = 'Hej HIK-medlem\n\nTak fordi du har oprettet dig på aabenbaneaften.dk.\n\nDin profil er nu klar, og du kan logge ind og tilmelde dig Åben Bane Aften, når tilmeldingen er åben.\n\nVi glæder os til at se dig på banen 🎾\n\nVenlig hilsen\nChristin\nÅben Bane Aften';
  const message = welcomeEmail('member@example.com');
  assert.equal(message.subject, 'Velkommen til Åben Bane Aften');
  assert.equal(message.text, expected);
  assert.match(message.html, /<strong>aabenbaneaften.dk<\/strong>/);
  const sent=[];
  assert.equal(await sendWelcomeEmail('member@example.com', async mail=>sent.push(mail)), null);
  assert.deepEqual(sent,[message]);
});
test('mail failure reports that the account still exists instead of asking for registration again', async () => {
  const warning = await sendWelcomeEmail('member@example.com', async()=>{throw new Error('Resend unavailable');});
  assert.match(warning,/profil er oprettet/);
  assert.match(warning,/kunne ikke sendes/);
});
