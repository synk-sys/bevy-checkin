import type { NormalizedAttendee } from "@/lib/server/bevy";

/** Deterministic dummy attendees for rehearsals and local development. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Aisha", "Wei", "Priya", "Mateo", "Fatima", "Liam", "Sofia", "Arjun", "Mei", "Noah", "Amara", "Diego", "Hana", "Omar", "Chloé", "Ravi", "Yuki", "Elena", "Kwame", "Zara", "Lucas", "Ananya", "Jin", "Isabella", "Tariq", "Grace", "Nikhil", "Leila", "Ethan", "Simran", "José", "Maya", "Daniel", "Ngozi", "Ivan", "Sara", "Kai", "Fiona", "Hamza", "Olivia"];
const LAST = ["Patel", "Chen", "Singh", "Rodríguez", "Okafor", "Nguyen", "Kim", "Ali", "Martin", "Tremblay", "Gagnon", "Wong", "Sharma", "Khan", "Silva", "Roy", "Murphy", "Haddad", "Lee", "Mensah", "Côté", "Brown", "Tanaka", "Ivanova", "Fernandes", "Gill", "Thompson", "Hussain", "Lam", "Wilson"];
const COMPANIES = ["Shopify", "Google", "RBC", "Wealthsimple", "Wattpad", "TD", "University of Toronto", "Toronto Metropolitan University", "Faire", "Cohere", "Ada", "1Password", "Freelance", "Stealth startup", "York University", "Telus", "Rogers", "Loblaw Digital", ""];
const TITLES = ["Software Engineer", "Android Developer", "Student", "Product Manager", "ML Engineer", "Designer", "Data Scientist", "Developer Advocate", "Founder", "Cloud Architect", "Web Developer", ""];
const TYPES: [string, number][] = [["General", 0.68], ["Student", 0.16], ["Speaker", 0.05], ["Volunteer", 0.06], ["Sponsor", 0.05]];

export function demoAttendees(count = 240, seed = 2026): NormalizedAttendee[] {
  const r = rng(seed);
  const pickOne = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const used = new Set<string>();
  const out: NormalizedAttendee[] = [];
  for (let i = 0; i < count; i++) {
    const firstName = pickOne(FIRST);
    const lastName = pickOne(LAST);
    let roll = r();
    let ticketType = "General";
    for (const [t, p] of TYPES) {
      if ((roll -= p) <= 0) {
        ticketType = t;
        break;
      }
    }
    const base = `${firstName}.${lastName}`.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
    let email = `${base}@example.com`;
    for (let n = 2; used.has(email); n++) email = `${base}${n}@example.com`;
    used.add(email);
    const code = `DF26-${Math.floor(r() * 36 ** 6).toString(36).toUpperCase().padStart(6, "0")}`;
    out.push({
      bevyId: `demo-${String(i + 1).padStart(4, "0")}`,
      ticketCode: code,
      firstName,
      lastName,
      email,
      company: ticketType === "Student" ? pickOne(["University of Toronto", "York University", "Toronto Metropolitan University", "Seneca Polytechnic"]) : pickOne(COMPANIES),
      title: ticketType === "Student" ? "Student" : pickOne(TITLES),
      ticketType,
      checkedIn: false,
    });
  }
  return out;
}
