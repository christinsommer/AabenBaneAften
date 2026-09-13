export type ExportSignupRow = {
  memberNo: string;
  firstName: string;
  lastName: string;
  gender?: string | null;
  christinRanking: number | null;
  availability: string[];
  requestedHours: number;
};

export function buildSignupExportRows(rows: ExportSignupRow[]) {
  const header = [
    "Medlemsnr.",
    "Fornavn Efternavn",
    "Medlems-køn",
    "CR",
    "nHours",
    "nPossible",
    "slot_1",
    "slot_2",
    "slot_3",
    "slot_4",
    "slot_5",
    "szPossible",
  ];

  const output = [header];

  for (const row of rows) {
    const availability = Array.isArray(row.availability) ? row.availability : [];
    const slots = Array.from({ length: 5 }, (_, index) => String(availability[index] ?? ""));
    const fullName = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
    const gender = row.gender ?? "";

    output.push([
      String(row.memberNo),
      String(fullName),
      String(gender),
      row.christinRanking == null ? "" : String(row.christinRanking),
      String(row.requestedHours),
      String(availability.length),
      ...slots,
      String(availability.join(";")),
    ]);
  }

  return output;
}
