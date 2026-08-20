export type Category = {
  id: string;
  label: string;
  query: string;
  googleType?: string;
};

export const CATEGORIES: Category[] = [
  { id: "plumber", label: "Plumbers", googleType: "plumber", query: "plumbers" },
  {
    id: "electrician",
    label: "Electricians",
    googleType: "electrician",
    query: "electricians",
  },
  { id: "hvac", label: "HVAC / heating & cooling", query: "HVAC contractors" },
  {
    id: "roofer",
    label: "Roofers",
    googleType: "roofing_contractor",
    query: "roofing contractors",
  },
  { id: "painter", label: "Painters", googleType: "painter", query: "painters" },
  {
    id: "locksmith",
    label: "Locksmiths",
    googleType: "locksmith",
    query: "locksmiths",
  },
  { id: "landscaper", label: "Landscapers", query: "landscapers" },
  { id: "pest", label: "Pest control", query: "pest control" },
  {
    id: "mover",
    label: "Movers",
    googleType: "moving_company",
    query: "moving companies",
  },
  { id: "contractor", label: "General contractors", query: "general contractors" },
  { id: "dentist", label: "Dentists", googleType: "dentist", query: "dentists" },
  {
    id: "chiro",
    label: "Chiropractors",
    googleType: "chiropractor",
    query: "chiropractors",
  },
  {
    id: "vet",
    label: "Veterinarians",
    googleType: "veterinary_care",
    query: "veterinarians",
  },
  {
    id: "salon",
    label: "Hair salons",
    googleType: "hair_salon",
    query: "hair salons",
  },
  {
    id: "barber",
    label: "Barbers",
    googleType: "barber_shop",
    query: "barber shops",
  },
  {
    id: "nails",
    label: "Nail salons",
    googleType: "nail_salon",
    query: "nail salons",
  },
  { id: "spa", label: "Spas", googleType: "spa", query: "spas" },
  {
    id: "auto",
    label: "Auto repair",
    googleType: "car_repair",
    query: "auto repair shops",
  },
  {
    id: "carwash",
    label: "Car washes",
    googleType: "car_wash",
    query: "car washes",
  },
  { id: "lawyer", label: "Lawyers", googleType: "lawyer", query: "lawyers" },
  {
    id: "accountant",
    label: "Accountants",
    googleType: "accounting",
    query: "accountants",
  },
  {
    id: "insurance",
    label: "Insurance agencies",
    googleType: "insurance_agency",
    query: "insurance agencies",
  },
  {
    id: "realtor",
    label: "Real estate agents",
    googleType: "real_estate_agency",
    query: "real estate agencies",
  },
  {
    id: "restaurant",
    label: "Restaurants",
    googleType: "restaurant",
    query: "restaurants",
  },
  { id: "cafe", label: "Cafes", googleType: "cafe", query: "cafes" },
  { id: "bakery", label: "Bakeries", googleType: "bakery", query: "bakeries" },
  { id: "florist", label: "Florists", googleType: "florist", query: "florists" },
  { id: "gym", label: "Gyms", googleType: "gym", query: "gyms" },
  {
    id: "laundry",
    label: "Laundromats",
    googleType: "laundry",
    query: "laundromats",
  },
  { id: "cleaning", label: "Cleaning services", query: "cleaning services" },
];

export function getCategory(id: string): Category | undefined {
  return CATEGORIES.find((item) => item.id === id);
}
