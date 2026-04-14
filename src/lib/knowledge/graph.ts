import type {
  TravelIntent,
  FlightOption,
  HotelOption,
  WeatherForecast,
  CulturalNorm,
  ActivityOption,
  ItineraryDay,
  GearRequirement,
  BudgetSummary,
} from "@/lib/types";

// Lightweight in-memory knowledge graph linking trip entities
export interface TripKnowledgeGraph {
  intent: TravelIntent;
  nodes: {
    flights: FlightOption[];
    hotels: HotelOption[];
    weather: WeatherForecast[];
    cultural: CulturalNorm[];
    activities: ActivityOption[];
  };
  edges: TripEdge[];
  derived: {
    itinerary: ItineraryDay[];
    packingList: GearRequirement[];
    budget: BudgetSummary;
  };
}

interface TripEdge {
  from: string; // node type + id
  to: string;
  relation: string;
}

export function buildKnowledgeGraph(
  intent: TravelIntent,
  flights: FlightOption[],
  hotels: HotelOption[],
  weather: WeatherForecast[],
  cultural: CulturalNorm[],
  activities: ActivityOption[]
): TripKnowledgeGraph {
  const edges: TripEdge[] = [];

  // Link intent -> top flights
  const sortedFlights = [...flights].sort((a, b) => a.price - b.price);
  const topFlights = sortedFlights.slice(0, 3);
  topFlights.forEach((f) => {
    edges.push({ from: "intent", to: `flight:${f.id}`, relation: "recommends" });
  });

  // Link intent -> best hotel (within budget)
  const nights = intent.duration || 5;
  const budgetForHotel = intent.budget ? (intent.budget - (topFlights[0]?.price || 0)) * 0.5 : Infinity;
  const affordableHotels = hotels
    .filter((h) => h.pricePerNight * nights <= budgetForHotel)
    .sort((a, b) => b.rating - a.rating);
  const bestHotel = affordableHotels[0] || hotels[0];
  if (bestHotel) {
    edges.push({ from: "intent", to: `hotel:${bestHotel.id}`, relation: "recommends" });
  }

  // Link activities -> itinerary days (pick most relevant, cap at nights*2+2)
  const activityCap = nights * 2 + 2;
  const relevantActivities = pickRelevantActivities(activities, intent.activities, activityCap);
  relevantActivities.forEach((a, i) => {
    const day = Math.floor(i / 2) + 1;
    edges.push({ from: `day:${day}`, to: `activity:${a.id}`, relation: "includes" });
  });

  // Link weather -> days
  weather.forEach((w, i) => {
    edges.push({ from: `day:${i + 1}`, to: `weather:${w.date}`, relation: "forecast" });
  });

  // Link cultural tips -> intent
  cultural.forEach((c, i) => {
    edges.push({ from: "intent", to: `cultural:${i}`, relation: "tip" });
  });

  // Derive itinerary
  const itinerary = buildItinerary(intent, relevantActivities, weather);
  const packingList = buildPackingList(weather, intent.activities);
  const budget = buildBudget(topFlights[0], bestHotel, relevantActivities, nights);

  return {
    intent,
    nodes: { flights: topFlights, hotels: affordableHotels.length > 0 ? affordableHotels : hotels, weather, cultural, activities: relevantActivities },
    edges,
    derived: { itinerary, packingList, budget },
  };
}

function pickRelevantActivities(
  activities: ActivityOption[],
  interests: string[],
  cap: number
): ActivityOption[] {
  if (activities.length <= cap) return activities;

  const score = (a: ActivityOption): number => {
    let s = 0;
    const text = `${a.name} ${a.category} ${a.description}`.toLowerCase();
    // +3 for each user interest that matches name/category/description
    for (const interest of interests) {
      if (text.includes(interest.toLowerCase())) s += 3;
    }
    // +2 if category directly matches an interest
    for (const interest of interests) {
      if (a.category.toLowerCase().includes(interest.toLowerCase())) s += 2;
    }
    // slight boost for activities with a real description and cost
    if (a.description && a.description.length > 30) s += 1;
    if (a.estimatedCost && a.estimatedCost > 0) s += 1;
    return s;
  };

  // Sort by score descending, keep original order as tiebreaker
  const scored = activities.map((a, i) => ({ a, s: score(a), i }));
  scored.sort((x, y) => y.s - x.s || x.i - y.i);
  return scored.slice(0, cap).sort((x, y) => x.i - y.i).map((x) => x.a);
}

function buildItinerary(
  intent: TravelIntent,
  activities: ActivityOption[],
  weather: WeatherForecast[]
): ItineraryDay[] {
  const nights = intent.duration || 5;
  const days: ItineraryDay[] = [];

  for (let d = 1; d <= nights + 1; d++) {
    const dayActivities = activities.filter((_, i) => Math.floor(i / 2) + 1 === d);
    const w = weather[d - 1];

    const timeSlots = ["9:00 AM", "11:30 AM", "2:00 PM", "4:30 PM", "7:00 PM"];
    const daySchedule: ItineraryDay["activities"] = [];

    if (d === 1) {
      daySchedule.push({ time: "9:00 AM", activity: "Arrive & check into hotel", notes: "Get settled, exchange currency if needed" });
      daySchedule.push({ time: "12:00 PM", activity: "Explore the neighborhood", location: "Near hotel", notes: "Get oriented, find nearby convenience stores" });
    }

    dayActivities.forEach((a, i) => {
      daySchedule.push({
        time: d === 1 ? timeSlots[i + 2] || "3:00 PM" : timeSlots[i] || "10:00 AM",
        activity: a.name,
        location: a.location,
        cost: a.estimatedCost,
        notes: a.description,
      });
    });

    if (daySchedule.length === 0 && d <= nights) {
      daySchedule.push({ time: "10:00 AM", activity: `Free exploration day in ${intent.destination}`, notes: "Wander, shop, or revisit favorites" });
    }

    if (d === nights + 1) {
      daySchedule.push({ time: "10:00 AM", activity: "Check out & head to airport", notes: "Allow 3 hours before flight" });
    }

    // Add dinner suggestion
    if (d <= nights) {
      daySchedule.push({
        time: "7:00 PM",
        activity: `Dinner — local ${intent.destination} cuisine`,
        cost: 20,
        notes: w ? `Weather: ${w.condition}, ${w.tempHighF}°F` : undefined,
      });
    }

    days.push({
      day: d,
      date: w?.date,
      title: d === 1 ? "Arrival Day" : d === nights + 1 ? "Departure Day" : `Day ${d} — ${dayActivities[0]?.category || "Exploration"}`,
      activities: daySchedule,
    });
  }

  return days;
}

function buildPackingList(weather: WeatherForecast[], interests: string[]): GearRequirement[] {
  const items: GearRequirement[] = [
    { item: "Passport & travel documents", reason: "Required for international travel", priority: "essential" },
    { item: "Phone charger & adapter", reason: "Different outlet types abroad", priority: "essential" },
    { item: "Comfortable walking shoes", reason: "Expect 10,000+ steps daily", priority: "essential" },
    { item: "Day backpack", reason: "Carry water, snacks, camera during exploration", priority: "essential" },
    { item: "Reusable water bottle", reason: "Stay hydrated, save money", priority: "recommended" },
    { item: "Travel-size toiletries", reason: "TSA compliance for carry-on", priority: "recommended" },
  ];

  // Weather-based items
  const avgHigh = weather.reduce((sum, w) => sum + w.tempHighF, 0) / (weather.length || 1);
  const hasRain = weather.some((w) => w.condition.toLowerCase().includes("rain"));

  if (avgHigh < 60) {
    items.push({ item: "Warm jacket", reason: `Average highs around ${Math.round(avgHigh)}°F`, priority: "essential" });
    items.push({ item: "Layers (sweater, long sleeves)", reason: "Temperatures vary throughout the day", priority: "recommended" });
  } else if (avgHigh > 80) {
    items.push({ item: "Sunscreen (SPF 50+)", reason: "Strong sun expected", priority: "essential" });
    items.push({ item: "Light, breathable clothing", reason: `Highs around ${Math.round(avgHigh)}°F`, priority: "essential" });
    items.push({ item: "Sunglasses & hat", reason: "Sun protection", priority: "recommended" });
  } else {
    items.push({ item: "Light layers", reason: `Moderate temps around ${Math.round(avgHigh)}°F`, priority: "recommended" });
  }

  if (hasRain) {
    items.push({ item: "Compact umbrella or rain jacket", reason: "Rain expected during trip", priority: "essential" });
  }

  // Activity-based items
  if (interests.includes("temples")) {
    items.push({ item: "Modest clothing (covered shoulders/knees)", reason: "Temple dress codes", priority: "essential" });
    items.push({ item: "Slip-on shoes", reason: "Frequent shoe removal at temples", priority: "recommended" });
  }
  if (interests.includes("hiking")) {
    items.push({ item: "Hiking boots", reason: "Trail terrain", priority: "essential" });
    items.push({ item: "Quick-dry clothing", reason: "Sweat management on trails", priority: "recommended" });
  }
  if (interests.includes("beaches")) {
    items.push({ item: "Swimsuit", reason: "Beach activities", priority: "essential" });
    items.push({ item: "Beach towel", reason: "Hotels may not provide beach towels", priority: "recommended" });
  }

  return items;
}

function buildBudget(
  flight: FlightOption | undefined,
  hotel: HotelOption | undefined,
  activities: ActivityOption[],
  nights: number
): BudgetSummary {
  const flightCost = (flight?.price || 600) * 2; // round trip
  const hotelCost = (hotel?.pricePerNight || 100) * nights;
  const activityCost = activities.reduce((sum, a) => sum + (a.estimatedCost || 0), 0);
  const foodCost = nights * 45; // ~$45/day estimate
  const transportCost = nights * 15; // ~$15/day local transport
  const miscCost = Math.round((flightCost + hotelCost) * 0.05); // 5% buffer

  return {
    flights: flightCost,
    hotels: hotelCost,
    activities: activityCost,
    food: foodCost,
    transport: transportCost,
    misc: miscCost,
    total: flightCost + hotelCost + activityCost + foodCost + transportCost + miscCost,
    currency: "USD",
  };
}
