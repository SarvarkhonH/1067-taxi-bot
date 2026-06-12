import type {
  ActiveBooking,
  ActiveBookingLite,
  BonusRules,
  BookingDriver,
  BookingRequest,
  BookingResult,
  CarModel,
  ClientBookingInfo,
  KasAddon,
  ClientTariff,
  CompanyInfo,
  GeoPoint,
  KasDataSource,
  KasMainReport,
  KasMember,
  RideHistoryItem,
  SavedAddress,
} from "./types";

const MOCK_ADDRESSES = [
  "Bunyodkor ko'chasi 12",
  "Mustaqillik maydoni 1",
  "Amir Temur shoh ko'chasi 45",
  "Koson bozori",
  "Navoiy ko'chasi 8",
];

// Believable demo data for both member types. Used until KAS_MODE=live.
const DRIVERS: KasMember[] = [
  { type: "driver", kasId: "1001", fullName: "Akmal Karimov", phone: "+998901112233", carNumber: "01A111AA", points: 48200, trips: 1240, rating: 4.9 },
  { type: "driver", kasId: "1002", fullName: "Bekzod To'rayev", phone: "+998902223344", carNumber: "01B222BB", points: 26100, trips: 760, rating: 4.8 },
  { type: "driver", kasId: "1003", fullName: "Dilshod Rahimov", phone: "+998903334455", carNumber: "01C333CC", points: 15600, trips: 540, rating: 4.7 },
  { type: "driver", kasId: "1004", fullName: "Sardor Yusupov", phone: "+998904445566", carNumber: "01D444DD", points: 9800, trips: 410, rating: 4.6 },
  { type: "driver", kasId: "1005", fullName: "Jasur Nazarov", phone: "+998905556677", carNumber: "01E555EE", points: 31200, trips: 880, rating: 4.95 },
  { type: "driver", kasId: "1006", fullName: "Otabek Sodiqov", phone: "+998906667788", carNumber: "01F666FF", points: 4300, trips: 190, rating: 4.5 },
  { type: "driver", kasId: "1007", fullName: "Shoxrux Mirzayev", phone: "+998907778899", carNumber: "01G777GG", points: 21800, trips: 690, rating: 4.85 },
  { type: "driver", kasId: "1008", fullName: "Ulug'bek Ismoilov", phone: "+998901234567", carNumber: "01H888HH", points: 52900, trips: 1380, rating: 4.92 },
  { type: "driver", kasId: "1009", fullName: "Sherzod Hakimov", phone: "+998903456789", carNumber: "01J999JJ", points: 18700, trips: 620, rating: 4.8 },
  { type: "driver", kasId: "1010", fullName: "Bahodir Xolmatov", phone: "+998905678901", carNumber: "01K121KK", points: 38500, trips: 1020, rating: 4.88 },
];

const CLIENTS: KasMember[] = [
  { type: "client", kasId: "10", fullName: "Aziza Yusupova", phone: "+998971112201", points: 12400, trips: 86, rating: 0 },
  { type: "client", kasId: "11", fullName: "Kamola Tosheva", phone: "+998971112202", points: 8900, trips: 64, rating: 0 },
  { type: "client", kasId: "12", fullName: "-", phone: "+998971112203", points: 6200, trips: 51, rating: 0 },
  { type: "client", kasId: "13", fullName: "Nodira Salimova", phone: "+998971112204", points: 4100, trips: 33, rating: 0 },
  { type: "client", kasId: "14", fullName: "-", phone: "+998971112205", points: 2750, trips: 22, rating: 0 },
  { type: "client", kasId: "15", fullName: "Jahongir Aliyev", phone: "+998971112206", points: 1850, trips: 17, rating: 0 },
  { type: "client", kasId: "16", fullName: "-", phone: "+998971112207", points: 980, trips: 11, rating: 0 },
  { type: "client", kasId: "17", fullName: "Malika Qodirova", phone: "+998971112208", points: 540, trips: 7, rating: 0 },
  { type: "client", kasId: "18", fullName: "-", phone: "+998971112209", points: 220, trips: 3, rating: 0 },
  { type: "client", kasId: "19", fullName: "Sevara Tojiyeva", phone: "+998971112210", points: 60, trips: 1, rating: 0 },
];

function jitter(base: number, pct: number): number {
  const delta = base * pct * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(base + delta));
}

export class KasMockSource implements KasDataSource {
  readonly name = "mock" as const;

  async fetchMembers(): Promise<KasMember[]> {
    return [...DRIVERS, ...CLIENTS].map((m) => ({
      ...m,
      points: jitter(m.points, 0.04),
      trips: m.trips + Math.floor(Math.random() * 3),
    }));
  }

  async fetchByPhone(phone: string): Promise<KasMember[]> {
    const norm = phone.replace(/\D/g, "").slice(-9);
    return [...DRIVERS, ...CLIENTS]
      .filter((m) => m.phone && m.phone.replace(/\D/g, "").slice(-9) === norm)
      .map((m) => ({ ...m, points: jitter(m.points, 0.04) }));
  }

  async checkClient(phone: string): Promise<ClientBookingInfo | null> {
    const member = CLIENTS.find((m) => m.phone && m.phone.replace(/\D/g, "").slice(-9) === phone.replace(/\D/g, "").slice(-9));
    return {
      clientName: member?.fullName ?? "Mijoz",
      phoneNumber: phone,
      addresses: [
        { id: 101, name: "🏠 Uy — Bunyodkor 12", lat: 39.0468, lng: 65.564, surcharge: 2000 },
        { id: 102, name: "💼 Ish — Mustaqillik maydoni 1", lat: 39.0447, lng: 65.5766 },
        { id: 103, name: "📍 Oxirgi — Koson bozori", lat: 39.0272, lng: 65.6065 },
      ],
      activeBooking: null,
    };
  }

  async searchAddresses(text: string): Promise<SavedAddress[]> {
    const q = text.toLowerCase();
    return MOCK_ADDRESSES.filter((a) => a.toLowerCase().includes(q))
      .slice(0, 5)
      .map((name, i) => ({ id: 200 + i, name, lat: 39.034 + i * 0.003, lng: 65.57 + i * 0.003 }));
  }

  async createBooking(req: BookingRequest): Promise<BookingResult> {
    return { ok: true, message: `mock booking for ${req.phoneNumber} @ ${req.addressName}` };
  }

  async getBookingAddons(): Promise<KasAddon[]> {
    return [
      { id: 2, name: "ORQA BAGAJ", price: 2000 },
      { id: 3, name: "TEPA BAGAJ", price: 5000 },
      { id: 8, name: "MOTO", price: 10000 },
    ];
  }

  async cancelBooking(_bookingId: number): Promise<BookingResult> {
    return { ok: true, message: "mock cancel" };
  }

  async setClientBonus(_phone: string, newBonus: number): Promise<{ ok: boolean; oldBonus: number; name?: string; status?: number }> {
    return { ok: true, oldBonus: 0, name: "mock", status: 200 };
  }

  async addClientBonus(_phone: string, delta: number): Promise<{ ok: boolean; oldBonus: number; newBonus: number; status?: number }> {
    return { ok: true, oldBonus: 0, newBonus: delta, status: 200 };
  }

  async listActiveBookings(): Promise<ActiveBookingLite[]> {
    return [];
  }

  async getDriverPins() {
    return [
      { lat: 39.041, lng: 65.585, bearing: 90, busy: false },
      { lat: 39.045, lng: 65.575, bearing: 180, busy: true },
      { lat: 39.038, lng: 65.59, bearing: 0, busy: false },
    ];
  }

  async getDriverByCar(_carNumber: string): Promise<BookingDriver | null> {
    return { fullName: "Davlat Bo'riyev", phone: "+998901234567", carModel: "Cobalt", carNumber: _carNumber || "70A123BC", rating: 4.9, lat: 39.0468, lng: 65.564 };
  }

  async getReportsPage(page: number, _size: number): Promise<RideHistoryItem[]> {
    if (page > 0) return [];
    return [
      { id: 9100, addressName: "Bozor", status: "completed", carNumber: "01A111AA", carModel: "Cobalt", payment: 12000, cashback: 500, at: new Date().toISOString() },
      { id: 9099, addressName: "Uy", status: "completed", carNumber: "01A111AA", carModel: "Cobalt", payment: 9000, cashback: 500, at: new Date().toISOString() },
      { id: 9098, addressName: "Ish", status: "completed", carNumber: "01B222BB", carModel: "Nexia", payment: 8000, cashback: 500, at: new Date().toISOString() },
    ];
  }

  async getRideHistory(_phone: string, size = 10): Promise<RideHistoryItem[]> {
    return [
      { id: 9001, addressName: "Koson bozori", status: "completed", carNumber: "70A111AA", carModel: "Cobalt", payment: 12000, cashback: 500, at: "2026-06-10T09:30:00.000+0000" },
      { id: 9000, addressName: "Bunyodkor 12", status: "completed", carNumber: "70B222BB", carModel: "Nexia", payment: 8000, cashback: 500, at: "2026-06-09T18:05:00.000+0000" },
    ].slice(0, size);
  }

  async getActiveBooking(_phone: string): Promise<ActiveBooking | null> {
    return {
      id: 40400,
      status: "called",
      addressName: "Bunyodkor ko'chasi 12",
      lat: 39.0468,
      lng: 65.564,
      clientBonus: 500,
      priceTier: "standard",
      createdDate: "2026-06-09T13:33:00.000+0000",
      driver: {
        fullName: "Davlat Bo'riyev",
        phone: "+998901234567",
        carModel: "Damas",
        carNumber: "01A777AA",
        rating: 4.8,
        lat: 39.0343,
        lng: 65.5703,
      },
    };
  }

  async getTariff(): Promise<ClientTariff> {
    return {
      minimalDistance: 3000,
      minimalPayment: 8000,
      firstKilometerPaymentInCity: 2000,
      secondKilometerPaymentInCity: 2000,
      distancePaymentInCity: 1800,
      firstKilometerPaymentInRegion: 2500,
      secondKilometerPaymentInRegion: 2500,
      distancePaymentInRegion: 2200,
      timePayment: 400,
    };
  }

  async getBonusRules(): Promise<BonusRules> {
    return {
      enabled: true,
      clientBonusCall: 300,
      clientBonusApp: 500,
      clientBonusCallFirstTime: 1000,
      clientBonusAppFirstTime: 2000,
      clientBonusMinimalDistance: 2000,
    };
  }

  async getCarModels(): Promise<CarModel[]> {
    return [
      { id: 1, name: "Ekonom", category: "economy", rating: 4.5 },
      { id: 2, name: "Komfort", category: "comfort", rating: 4.7 },
      { id: 3, name: "Biznes", category: "business", rating: 4.9 },
    ];
  }

  async getCompanyInfo(): Promise<CompanyInfo> {
    return { companyName: "Koson 1067 Taxi", dispatcherPhones: ["1067", "+998 75 451 10 67"], lat: 39.0343, lng: 65.5703 };
  }

  async getServiceArea(): Promise<GeoPoint[]> {
    return [
      { lat: 39.05, lng: 65.55 },
      { lat: 39.05, lng: 65.59 },
      { lat: 39.02, lng: 65.59 },
      { lat: 39.02, lng: 65.55 },
    ];
  }

  async getMainReport(): Promise<KasMainReport> {
    return { completedYesterday: 160, bookingsYesterday: 200, onlineDrivers: 30, activeDrivers: 120, serviceCost: 0 };
  }
}
