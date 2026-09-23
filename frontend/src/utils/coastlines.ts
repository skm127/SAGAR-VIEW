/**
 * Simplified coastlines for Bay of Bengal and Indian Ocean region.
 * Coordinates are [longitude, latitude] points in degrees.
 */

// Coast of India (East Coast from south tip ~8°N to Bengal ~22°N)
export const INDIA_EAST_COAST: [number, number][] = [
  [77.55, 8.08],   // Kanyakumari
  [78.13, 8.81],   // Thoothukudi
  [79.31, 9.28],   // Rameswaram
  [79.83, 10.76],  // Nagapattinam
  [79.84, 11.93],  // Puducherry
  [80.27, 13.08],  // Chennai
  [80.05, 14.44],  // Nellore
  [80.64, 15.91],  // Bapatla
  [81.14, 16.18],  // Machilipatnam
  [82.24, 16.98],  // Kakinada
  [83.30, 17.68],  // Visakhapatnam
  [84.88, 19.31],  // Gopalpur
  [85.83, 19.81],  // Puri
  [86.67, 20.26],  // Paradip
  [87.05, 20.73],  // Chandbali
  [87.51, 21.63],  // Digha
  [88.18, 21.65],  // Sagar Island
];

// Coast of Bangladesh (Ganges-Brahmaputra Delta)
export const BANGLADESH_COAST: [number, number][] = [
  [88.90, 21.75],
  [89.50, 21.80],
  [90.10, 22.00],
  [90.70, 22.20],
  [91.40, 22.50],
  [91.80, 22.30],  // Chittagong
  [91.97, 21.43],  // Cox's Bazar
  [92.30, 20.80],  // Teknaf
];

// Coast of Myanmar & Malay Peninsula
export const MYANMAR_COAST: [number, number][] = [
  [92.30, 20.80],
  [92.80, 20.15],  // Sittwe
  [93.50, 19.40],  // Kyaukphyu
  [94.20, 18.30],  // Thandwe
  [94.30, 16.00],  // Cape Negrais
  [95.20, 15.70],  // Irrawaddy Delta
  [96.30, 16.50],  // Yangon River mouth
  [97.60, 16.45],  // Mawlamyine
  [98.20, 15.00],  // Dawei
  [98.60, 12.45],  // Myeik
  [98.50, 10.00],  // Kawthaung
  [98.30, 8.00],   // Phuket
  [100.0, 5.40],   // Penang
];

// Sri Lanka
export const SRI_LANKA: [number, number][] = [
  [80.20, 6.05],   // Galle
  [79.85, 6.93],   // Colombo
  [79.80, 8.00],   // Kalpitiya
  [79.90, 8.90],   // Mannar
  [80.00, 9.66],   // Jaffna
  [80.90, 9.00],   // Mullaitivu
  [81.23, 8.58],   // Trincomalee
  [81.70, 7.72],   // Batticaloa
  [81.85, 6.80],   // Arugam Bay
  [81.25, 6.20],   // Hambantota
  [80.55, 5.95],   // Dondra Head
  [80.20, 6.05],   // Close loop
];

// Andaman & Nicobar Islands (Chain)
export const ANDAMAN_ISLANDS: [number, number][] = [
  [92.80, 13.50],  // North Andaman
  [92.95, 13.00],  // Middle Andaman
  [92.75, 12.00],  // South Andaman / Port Blair
  [92.60, 11.60],
  [92.55, 10.60],  // Little Andaman
];

export const NICOBAR_ISLANDS: [number, number][] = [
  [92.80, 9.20],   // Car Nicobar
  [93.65, 8.00],   // Nancowry
  [93.85, 7.00],   // Great Nicobar
];

// All regional coastlines
export const REGIONAL_COASTLINES: [number, number][][] = [
  INDIA_EAST_COAST,
  BANGLADESH_COAST,
  MYANMAR_COAST,
  SRI_LANKA,
  ANDAMAN_ISLANDS,
  NICOBAR_ISLANDS,
];
