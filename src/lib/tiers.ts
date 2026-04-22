// Edit prices/labels here to update them across the site.
export type TierId = "standard" | "vip" | "entrance";

export interface Tier {
  id: TierId;
  name: string;
  price: number; // EUR
  description: string;
  perks: string[];
}

export const TIERS: Tier[] = [
  {
    id: "entrance",
    name: "Entrance Ticket",
    price: 10,
    description: "Get in the door and enjoy the night.",
    perks: ["General admission", "Access to main floor"],
  },
  {
    id: "standard",
    name: "Standard Reservation",
    price: 100,
    description: "Reserved table for the full experience.",
    perks: ["Reserved table", "Priority entry", "Dedicated host"],
  },
  {
    id: "vip",
    name: "VIP Reservation",
    price: 250,
    description: "The full VIP treatment for you and your guests.",
    perks: ["Premium VIP table", "Bottle service area", "Skip-the-line entry", "Personal concierge"],
  },
];

export const getTier = (id: TierId) => TIERS.find((t) => t.id === id)!;
