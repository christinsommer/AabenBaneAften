type RegistrationWindow = {
  registrationOverride: "auto" | "open" | "closed";
  registrationOpensAt: string;
  registrationClosesAt: string;
  status: string;
};

export function registrationIsOpen(event: RegistrationWindow, now = Date.now()) {
  if (event.status === "cancelled") return false;
  if (event.registrationOverride === "open") return true;
  if (event.registrationOverride === "closed") return false;
  return now >= Date.parse(event.registrationOpensAt) && now <= Date.parse(event.registrationClosesAt);
}
