import { isSelfLevel, type SelfLevel } from './ranking.ts';

export function profileValues(body: Record<string, unknown>): {
  firstName: string; lastName: string; name: string; memberNo: string;
  email: string; selfLevel: SelfLevel; gender: "M" | "K";
  phone?: string; phoneCountryCode?: string;
} {
  const firstName = String(body.firstName ?? "").trim();
  const lastName = String(body.lastName ?? "").trim();
  const memberNo = String(body.memberNo ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const selfLevel = String(body.level ?? "").trim();
  const gender = body.gender;
  if (gender !== "M" && gender !== "K") throw new Error("Vælg køn: M (mand) eller K (kvinde).");
  if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100)
    throw new Error("Angiv fornavn og efternavn (højst 100 tegn hver).");
  if (!memberNo || memberNo.length > 30) throw new Error("Angiv et gyldigt medlemsnummer.");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Angiv en gyldig e-mailadresse.");
  if (!isSelfLevel(selfLevel)) throw new Error("Vælg egen ranking: A, AB, B, BC, C eller Begynder.");
  const telephone: {phone?:string;phoneCountryCode?:string} = {};
  if (body.phone !== undefined) {
    const phone = String(body.phone).trim();
    if (!/^[0-9]*$/.test(phone) || phone.length > 15) throw new Error("Telefonnummer skal være kun cifre uden landekode (højst 15 cifre).");
    telephone.phone = phone;
  }
  if (body.phoneCountryCode !== undefined) {
    const code = String(body.phoneCountryCode).trim();
    if (!/^\+[1-9][0-9]{0,2}$/.test(code)) throw new Error("Angiv en landekode, fx +45 for Danmark.");
    telephone.phoneCountryCode = code;
  }
  return { firstName, lastName, name: `${firstName} ${lastName}`, memberNo, email, selfLevel, gender, ...telephone };
}
