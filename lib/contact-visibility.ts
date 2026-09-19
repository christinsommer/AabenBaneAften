export function visiblePlanContact(person: {
  id: number; name: string; email: string; phone: string; phoneCountryCode: string;
  emailVisible: boolean; phoneVisible: boolean;
}) {
  return {
    id: person.id, name: person.name,
    email: person.emailVisible ? person.email : '',
    phone: person.phoneVisible ? person.phone : '',
    phoneCountryCode: person.phoneVisible ? person.phoneCountryCode : '',
  };
}
