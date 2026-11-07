import type { Point } from "../core";

/**
 * [lon, lat] of the countries and territories that `world-110m` does NOT draw (at 1:110m the
 * microstates and most islands disappear). Pass it as `fallbackPoints` so a datum for Andorra or
 * Singapore shows up as a colored dot instead of silently getting lost.
 *
 * It is not exhaustive: it covers the missing independent countries and the territories most common
 * in business data (Hong Kong, Macao, Gibraltar, the Faroe Islands…). Add your own with a spread.
 */
export const worldFallbackPoints: Readonly<Record<string, Point>> = {
  AD: [1.52, 42.51], // Andorra
  AG: [-61.8, 17.06], // Antigua and Barbuda
  AW: [-69.97, 12.52], // Aruba
  AX: [19.95, 60.18], // Åland
  BB: [-59.54, 13.19], // Barbados
  BH: [50.55, 26.07], // Bahrain
  BM: [-64.75, 32.31], // Bermuda
  CV: [-23.6, 15.1], // Cape Verde
  CW: [-68.99, 12.17], // Curaçao
  DM: [-61.37, 15.41], // Dominica
  FM: [158.2, 6.92], // Micronesia
  FO: [-6.91, 61.89], // Faroe Islands
  GD: [-61.68, 12.12], // Grenada
  GG: [-2.58, 49.45], // Guernsey
  GI: [-5.35, 36.14], // Gibraltar
  GU: [144.79, 13.44], // Guam
  HK: [114.17, 22.32], // Hong Kong
  IM: [-4.55, 54.24], // Isle of Man
  JE: [-2.13, 49.21], // Jersey
  KI: [173.0, 1.42], // Kiribati
  KM: [43.87, -11.65], // Comoros
  KN: [-62.78, 17.36], // Saint Kitts and Nevis
  KY: [-81.25, 19.31], // Cayman Islands
  LC: [-60.98, 13.91], // Saint Lucia
  LI: [9.55, 47.16], // Liechtenstein
  MC: [7.42, 43.74], // Monaco
  MH: [171.18, 7.13], // Marshall Islands
  MO: [113.54, 22.2], // Macao
  MT: [14.38, 35.9], // Malta
  MU: [57.55, -20.35], // Mauritius
  MV: [73.22, 3.2], // Maldives
  NR: [166.93, -0.52], // Nauru
  PF: [-149.4, -17.68], // French Polynesia
  PW: [134.58, 7.51], // Palau
  SC: [55.49, -4.68], // Seychelles
  SG: [103.82, 1.35], // Singapore
  SM: [12.46, 43.94], // San Marino
  ST: [6.61, 0.19], // São Tomé and Príncipe
  TO: [-175.2, -21.18], // Tonga
  TV: [179.2, -8.52], // Tuvalu
  VA: [12.45, 41.9], // Vatican City
  VC: [-61.2, 13.25], // Saint Vincent and the Grenadines
  WS: [-172.1, -13.76], // Samoa
};
