import { getDb } from "./client";
import { teamAliases } from "./schema/teams";

const ALIASES: Record<string, string[]> = {
  "Team Liquid": ["Liquid", "TL", "Team Liquid Honda"],
  "Cloud9": ["C9", "Cloud 9"],
  "T1": ["SK Telecom T1", "SKT T1", "SKT"],
  "G2 Esports": ["G2", "G2.iG"],
  "Fnatic": ["FNC"],
  "FaZe Clan": ["FaZe"],
  "Natus Vincere": ["NAVI", "Na'Vi", "NaVi"],
  "Vitality": ["Team Vitality"],
  "MOUZ": ["mousesports", "mouz"],
  "Astralis": ["Astralis Talent"],
  "Heroic": ["HEROIC"],
  "OG": ["OG Esports"],
  "Evil Geniuses": ["EG"],
  "100 Thieves": ["100T"],
  "NRG": ["NRG Esports"],
  "Sentinels": ["SEN"],
  "Paper Rex": ["PRX"],
  "DRX": ["Dragon X", "DragonX"],
  "Gen.G": ["Gen.G Esports", "GenG"],
  "Team Spirit": ["Spirit"],
  "BIG": ["BIG Clan"],
  "Complexity": ["Complexity Gaming", "coL"],
  "FURIA": ["FURIA Esports"],
  "Imperial": ["Imperial Esports"],
  "paiN Gaming": ["paiN"],
  "LOUD": ["LOUD Esports"],
  "KRÜ Esports": ["KRÜ", "KRU", "KRU Esports"],
  "Leviatán": ["Leviatán Esports", "LEVIATÁN", "LEV"],
  "Team Falcons": ["Falcons", "Falcons Esports"],
  "Eternal Fire": ["EF"],
  "ThunderPick World Championship": [],
};

async function seed() {
  const db = getDb();
  let count = 0;

  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    for (const alias of [canonical, ...aliases]) {
      await db
        .insert(teamAliases)
        .values({ alias, canonicalName: canonical })
        .onConflictDoNothing();
      count++;
    }
  }

  console.log(`Seeded ${count} team aliases`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
