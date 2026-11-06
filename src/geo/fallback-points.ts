import type { Point } from "../core";

/**
 * [lon, lat] de los países y territorios que `world-110m` NO dibuja (a 1:110m desaparecen los
 * microestados y la mayoría de las islas). Pásalo como `fallbackPoints` para que un dato de
 * Andorra o Singapur aparezca como un punto con su color en vez de perderse en silencio.
 *
 * No es exhaustivo: cubre los países independientes que faltan y los territorios más habituales
 * en datos de negocio (Hong Kong, Macao, Gibraltar, Islas Feroe…). Añade los tuyos con un spread.
 */
export const worldFallbackPoints: Readonly<Record<string, Point>> = {
  AD: [1.52, 42.51], // Andorra
  AG: [-61.8, 17.06], // Antigua y Barbuda
  AW: [-69.97, 12.52], // Aruba
  AX: [19.95, 60.18], // Åland
  BB: [-59.54, 13.19], // Barbados
  BH: [50.55, 26.07], // Baréin
  BM: [-64.75, 32.31], // Bermudas
  CV: [-23.6, 15.1], // Cabo Verde
  CW: [-68.99, 12.17], // Curazao
  DM: [-61.37, 15.41], // Dominica
  FM: [158.2, 6.92], // Micronesia
  FO: [-6.91, 61.89], // Islas Feroe
  GD: [-61.68, 12.12], // Granada
  GG: [-2.58, 49.45], // Guernsey
  GI: [-5.35, 36.14], // Gibraltar
  GU: [144.79, 13.44], // Guam
  HK: [114.17, 22.32], // Hong Kong
  IM: [-4.55, 54.24], // Isla de Man
  JE: [-2.13, 49.21], // Jersey
  KI: [173.0, 1.42], // Kiribati
  KM: [43.87, -11.65], // Comoras
  KN: [-62.78, 17.36], // San Cristóbal y Nieves
  KY: [-81.25, 19.31], // Islas Caimán
  LC: [-60.98, 13.91], // Santa Lucía
  LI: [9.55, 47.16], // Liechtenstein
  MC: [7.42, 43.74], // Mónaco
  MH: [171.18, 7.13], // Islas Marshall
  MO: [113.54, 22.2], // Macao
  MT: [14.38, 35.9], // Malta
  MU: [57.55, -20.35], // Mauricio
  MV: [73.22, 3.2], // Maldivas
  NR: [166.93, -0.52], // Nauru
  PF: [-149.4, -17.68], // Polinesia Francesa
  PW: [134.58, 7.51], // Palaos
  SC: [55.49, -4.68], // Seychelles
  SG: [103.82, 1.35], // Singapur
  SM: [12.46, 43.94], // San Marino
  ST: [6.61, 0.19], // Santo Tomé y Príncipe
  TO: [-175.2, -21.18], // Tonga
  TV: [179.2, -8.52], // Tuvalu
  VA: [12.45, 41.9], // Ciudad del Vaticano
  VC: [-61.2, 13.25], // San Vicente y las Granadinas
  WS: [-172.1, -13.76], // Samoa
};
