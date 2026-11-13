// Region presets for the `region` prop: plain lists of ISO 3166-1 alpha-2 ids.
//
// Every id must exist in `world110m` or in `worldFallbackPoints` (a test guards against typos).
// Membership follows the UN geoscheme (M49), with these deliberate choices:
//  - Russia belongs to NO preset: it spans two continents and its main body is all of Siberia, which makes
//    any map that contains it unusable. Ask for it explicitly: `region="RU"`.
//  - Turkey, Cyprus, the Caucasus and Kazakhstan are Asia; Egypt is Africa; Greenland is North America.
//  - Antarctica and the French Southern Lands belong to no preset.

// One space-separated string per list: it keeps each preset on a line or two, easy to read and to diff.
const ids = (list: string): readonly string[] => list.split(" ");

const northernEurope = ids("AX DK EE FI FO GB GG IE IM IS JE LT LV NO SE");
const westernEurope = ids("AT BE CH DE FR LI LU MC NL");
const southernEurope = ids("AD AL BA ES GI GR HR IT ME MK MT PT RS SI SM VA XK");
const easternEurope = ids("BG BY CZ HU MD PL RO SK UA");

const northernAfrica = ids("DZ EG EH LY MA SD TN");
const easternAfrica = ids("BI DJ ER ET KE KM MG MU MW MZ RW SC SO SS TZ UG ZM ZW");
const middleAfrica = ids("AO CD CF CG CM GA GQ ST TD");
const southernAfrica = ids("BW LS NA SZ ZA");
const westernAfrica = ids("BF BJ CI CV GH GM GN GW LR ML MR NE NG SL SN TG");

const centralAsia = ids("KG KZ TJ TM UZ");
const easternAsia = ids("CN HK JP KP KR MN MO TW");
const southeasternAsia = ids("BN ID KH LA MM MY PH SG TH TL VN");
const southernAsia = ids("AF BD BT IN IR LK MV NP PK");
const westernAsia = ids("AE AM AZ BH CY GE IL IQ JO KW LB OM PS QA SA SY TR YE");

// The UN calls this subregion "Northern America"; `usAndCanada` avoids confusing it with `northAmerica`.
const usAndCanada = ids("BM CA GL US");
const centralAmerica = ids("BZ CR GT HN MX NI PA SV");
const caribbean = ids("AG AW BB BS CU CW DM DO GD HT JM KN KY LC PR TT VC");
const southAmerica = ids("AR BO BR CL CO EC FK GY PE PY SR UY VE");

const australiaAndNewZealand = ids("AU NZ");
const melanesia = ids("FJ NC PG SB VU");
const micronesia = ids("FM GU KI MH NR PW");
const polynesia = ids("PF TO TV WS");

export const REGION_PRESETS = {
  // Continents: disjoint, each one is the union of its subregions.
  africa: [
    ...northernAfrica,
    ...easternAfrica,
    ...middleAfrica,
    ...southernAfrica,
    ...westernAfrica,
  ],
  asia: [...centralAsia, ...easternAsia, ...southeasternAsia, ...southernAsia, ...westernAsia],
  europe: [...northernEurope, ...westernEurope, ...southernEurope, ...easternEurope],
  northAmerica: [...usAndCanada, ...centralAmerica, ...caribbean],
  southAmerica,
  oceania: [...australiaAndNewZealand, ...melanesia, ...micronesia, ...polynesia],

  // Subregions (UN geoscheme).
  northernAfrica,
  easternAfrica,
  middleAfrica,
  southernAfrica,
  westernAfrica,
  centralAsia,
  easternAsia,
  southeasternAsia,
  southernAsia,
  westernAsia,
  northernEurope,
  westernEurope,
  southernEurope,
  easternEurope,
  usAndCanada,
  centralAmerica,
  caribbean,
  australiaAndNewZealand,
  melanesia,
  micronesia,
  polynesia,

  // Political / commercial groupings: they may overlap with everything else. FIRST CUT, to be confirmed with
  // the tools that will use them (see FEAT-022); each one is a maintenance cost.
  eu27: ids("AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK"),
  nordics: ids("DK FI IS NO SE"),
  iberia: ids("ES PT"),
  latam: ids("AR BO BR CL CO CR CU DO EC GT HN HT MX NI PA PE PR PY SV UY VE"),
  mena: ids("AE BH DZ EG EH IL IQ IR JO KW LB LY MA OM PS QA SA SY TN YE"),
} satisfies Record<string, readonly string[]>;

export type RegionPresetName = keyof typeof REGION_PRESETS;
