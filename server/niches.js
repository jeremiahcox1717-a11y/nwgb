export const OSM_NICHE_REGEX = {
  all: null,
  beauty:
    "hairdresser|barber|beauty|nails|tattoo|massage|cosmetic|chemist|perfumery",
  trades:
    "trade|electrician|plumber|carpenter|painter|roofer|locksmith|handyman|builder|window_blind",
  food: "restaurant|cafe|bar|pub|fast_food|bakery|butcher|greengrocer|deli|ice_cream",
  auto: "car_repair|car|tyres|fuel|car_wash",
  health: "pharmacy|dentist|doctors|clinic|physiotherapist|optician|veterinary",
  fitness: "fitness_centre|sports_centre|yoga|pilates",
  home: "florist|laundry|dry_cleaning|funeral_directors|estate_agent|furniture|bed|kitchen|bathroom_furnishing",
};

const HAIR_TRADE_RE =
  /\b(barber|barbershop|clipper|fadez?|cutz|haircut|hairdresser|hairstylist|hair\s*stylist|stylist|salon|braid(?:er|s|ing)?|knotless|cornrow|fulani|locs?|dreadlock|twist(?:s|out)?|weave|wig|sew[\s-]?in|silk\s*press|blowout|afro|natural\s*hair|hair|nails?|lash(?:es)?|brow|beauty|makeup|make[\s-]?up|mua|esthetician|cosmetolog|keratin|relaxer|beard|shave|trim|glam)\b/i;

const HAIR_HANDLE_RE =
  /barber|braid|hair|salon|fade|nail|lash|wig|locz|\blocs\b|cutz|stylist|beauty|beard/i;

export function looksLikeHairTrade(text) {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  return HAIR_TRADE_RE.test(raw) || HAIR_HANDLE_RE.test(raw);
}

function igQuery(place, terms) {
  return `site:instagram.com "${place}" (${terms})`;
}

export function instagramHuntPlans(place, niche = "all") {
  const hair = [
    {
      label: "Barbers",
      match: "hair",
      query: igQuery(
        place,
        'barber OR barbershop OR "barber shop" OR fade OR clippers OR barbering',
      ),
    },
    {
      label: "Braiders",
      match: "hair",
      query: igQuery(
        place,
        'braider OR braids OR braiding OR knotless OR "hair braiding" OR cornrows',
      ),
    },
    {
      label: "Stylists",
      match: "hair",
      query: igQuery(
        place,
        '"hair stylist" OR hairstylist OR hairdresser OR "hair salon" OR salon',
      ),
    },
    {
      label: "Locs / weaves",
      match: "hair",
      query: igQuery(
        place,
        'locs OR dreadlocks OR weave OR wig OR "silk press" OR "natural hair"',
      ),
    },
    {
      label: "Nails / lashes",
      match: "hair",
      query: igQuery(place, "nails OR lashes OR brows OR makeup OR beauty"),
    },
  ];

  const other = {
    trades: [
      {
        label: "Trades",
        query: igQuery(place, "plumber OR electrician OR roofer OR locksmith OR builder"),
      },
    ],
    food: [
      {
        label: "Food",
        query: igQuery(place, "bakery OR cafe OR restaurant OR butcher"),
      },
    ],
    auto: [
      {
        label: "Auto",
        query: igQuery(place, "garage OR mechanic OR detailing"),
      },
    ],
    health: [
      {
        label: "Health",
        query: igQuery(place, "dentist OR physio OR clinic"),
      },
    ],
    fitness: [
      {
        label: "Fitness",
        query: igQuery(place, "gym OR pilates OR yoga OR pt"),
      },
    ],
    home: [
      {
        label: "Home",
        query: igQuery(place, "florist OR cleaner OR laundry OR curtains"),
      },
    ],
  };

  if (niche === "beauty") return hair;
  if (other[niche]) return other[niche];
  return [
    ...hair,
    {
      label: "Other shops",
      query: igQuery(place, "plumber OR florist OR bakery OR cafe OR gym OR electrician"),
    },
  ];
}

export function instagramSearchLinks(plans) {
  return (plans || []).map((plan) => ({
    label: plan.label,
    query: plan.query,
    googleUrl: `https://www.google.com/search?q=${encodeURIComponent(plan.query)}`,
    bingUrl: `https://www.bing.com/search?q=${encodeURIComponent(plan.query)}`,
  }));
}

const ALL_PLACE_TYPES = [
  "hair_care",
  "beauty_salon",
  "plumber",
  "electrician",
  "restaurant",
  "cafe",
  "bakery",
  "florist",
  "gym",
  "car_repair",
  "dentist",
  "spa",
  "bar",
  "meal_takeaway",
  "pet_store",
  "locksmith",
  "painter",
  "roofing_contractor",
  "moving_company",
  "laundry",
];

export function googlePlaceTypesFor(niche) {
  if (niche === "beauty") return ["hair_care", "beauty_salon", "spa"];
  if (niche === "trades") {
    return ["plumber", "electrician", "locksmith", "painter", "roofing_contractor"];
  }
  if (niche === "food") return ["restaurant", "cafe", "bakery", "bar", "meal_takeaway"];
  if (niche === "auto") return ["car_repair"];
  if (niche === "health") return ["dentist"];
  if (niche === "fitness") return ["gym"];
  if (niche === "home") return ["florist", "laundry", "moving_company"];
  return ALL_PLACE_TYPES.slice(0, 20);
}
