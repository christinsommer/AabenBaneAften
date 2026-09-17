export function welcomeEmail(to: string) {
  return {
    to,
    subject: "Velkommen til Åben Bane Aften",
    text: "Hej HIK-medlem\n\nTak fordi du har oprettet dig på https://aabenbaneaften.dk.\n\nDin profil er nu klar, og du kan logge ind og tilmelde dig Åben Bane Aften, når tilmeldingen er åben.\n\nVi glæder os til at se dig på banen 🎾\n\nVenlig hilsen\nChristin\nÅben Bane Aften",
    html: '<p>Hej HIK-medlem</p><p>Tak fordi du har oprettet dig på <strong><a href="https://aabenbaneaften.dk">aabenbaneaften.dk</a></strong>.</p><p>Din profil er nu klar, og du kan logge ind og tilmelde dig Åben Bane Aften, når tilmeldingen er åben.</p><p>Vi glæder os til at se dig på banen 🎾</p><p>Venlig hilsen<br>Christin<br>Åben Bane Aften</p>',
  };
}

export async function sendWelcomeEmail(to: string, send: (message: ReturnType<typeof welcomeEmail>) => Promise<unknown>) {
  try {
    await send(welcomeEmail(to));
    return null;
  } catch {
    return "Din profil er oprettet, men velkomstmailen kunne ikke sendes. Du kan bruge din profil og logge ind som normalt.";
  }
}
