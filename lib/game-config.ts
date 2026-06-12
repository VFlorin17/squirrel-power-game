export type PowerId = "none" | "seeds" | "fire" | "speed" | "shield" | "ice" | "obsidian"

export interface FoodType {
  id: string
  name: string
  emoji: string
  color: string
  power: PowerId
  powerName: string
  description: string
  heal: number
  stackValue: number
  spawnWeight: number
  rare?: boolean
}

export const FOODS: FoodType[] = [
  {
    id: "acorn",
    name: "Acorn",
    emoji: "🌰",
    color: "#8a5a2b",
    power: "none",
    powerName: "Snack",
    description: "Heal and score boost.",
    heal: 16,
    stackValue: 0,
    spawnWeight: 12,
  },
  {
    id: "apple",
    name: "Apple",
    emoji: "🍎",
    color: "#e23b3b",
    power: "seeds",
    powerName: "Bramble Fan",
    description: "Locks the thorn spread weapon path.",
    heal: 8,
    stackValue: 1,
    spawnWeight: 4,
  },
  {
    id: "pepper",
    name: "Red Pepper",
    emoji: "🌶️",
    color: "#ff6b2f",
    power: "fire",
    powerName: "Ember Bow",
    description: "Locks a straight lance weapon with explosive late tiers.",
    heal: 6,
    stackValue: 1,
    spawnWeight: 3,
    rare: true,
  },
  {
    id: "blueberry",
    name: "Blueberry",
    emoji: "🫐",
    color: "#4a6cf7",
    power: "speed",
    powerName: "Bolt Needle",
    description: "Locks the fast precision needle path.",
    heal: 8,
    stackValue: 1,
    spawnWeight: 4,
  },
  {
    id: "walnut",
    name: "Walnut",
    emoji: "🥜",
    color: "#d7b06a",
    power: "shield",
    powerName: "Walnut Guard",
    description: "Passive shield stack. Never changes your weapon path.",
    heal: 10,
    stackValue: 1,
    spawnWeight: 10,
  },
  {
    id: "ice-melon",
    name: "Ice Melon",
    emoji: "🍈",
    color: "#8be5ff",
    power: "ice",
    powerName: "Frost Rail",
    description: "Locks the slow-heavy shard path.",
    heal: 7,
    stackValue: 1,
    spawnWeight: 2,
    rare: true,
  },
]

export interface EnemyTier {
  title: string
  hp: number
  speed: number
  size: number
  reward: number
  color: string
  colorDark: string
}

export const ENEMY_TIERS: EnemyTier[] = [
  { title: "Young", hp: 22, speed: 1.8, size: 11, reward: 16, color: "#7fd36f", colorDark: "#4d8a3c" },
  { title: "Hunter", hp: 38, speed: 2.15, size: 12, reward: 22, color: "#91c45d", colorDark: "#587a2f" },
  { title: "Alpha", hp: 62, speed: 2.5, size: 14, reward: 30, color: "#d4b042", colorDark: "#8f6b1f" },
  { title: "Elite", hp: 95, speed: 2.9, size: 16, reward: 42, color: "#e18d3d", colorDark: "#924f1d" },
  { title: "Mythic", hp: 145, speed: 3.25, size: 18, reward: 60, color: "#db5252", colorDark: "#7f2323" },
]

export type EnemyType =
  | "slither"
  | "spitter"
  | "charger"
  | "splitter"
  | "orbiter"
  | "raptor"
  | "dingo"
  | "microBoss"
  | "miniBoss"
  | "boss"

export interface EnemyArchetype {
  type: EnemyType
  name: string
  tierBias: number
  hpMul: number
  speedMul: number
  contactDamage: number
  rangedCooldown: number
  summonCooldown: number
  splitCount: number
}

export const ENEMY_ARCHETYPES: Record<EnemyType, EnemyArchetype> = {
  slither: { type: "slither", name: "Slither Snake", tierBias: 0, hpMul: 1, speedMul: 1, contactDamage: 9, rangedCooldown: 0, summonCooldown: 0, splitCount: 0 },
  spitter: { type: "spitter", name: "Spitter Snake", tierBias: 0, hpMul: 0.9, speedMul: 0.95, contactDamage: 8, rangedCooldown: 1800, summonCooldown: 0, splitCount: 0 },
  charger: { type: "charger", name: "Charger Snake", tierBias: 1, hpMul: 1.05, speedMul: 1.15, contactDamage: 14, rangedCooldown: 0, summonCooldown: 2200, splitCount: 0 },
  splitter: { type: "splitter", name: "Hydra Snake", tierBias: 1, hpMul: 1.1, speedMul: 0.95, contactDamage: 10, rangedCooldown: 0, summonCooldown: 0, splitCount: 2 },
  orbiter: { type: "orbiter", name: "Orbiter Snake", tierBias: 1, hpMul: 0.95, speedMul: 1.08, contactDamage: 9, rangedCooldown: 1400, summonCooldown: 0, splitCount: 0 },
  raptor: { type: "raptor", name: "Raptor Bird", tierBias: 1, hpMul: 0.72, speedMul: 1.45, contactDamage: 12, rangedCooldown: 0, summonCooldown: 1600, splitCount: 0 },
  dingo: { type: "dingo", name: "Dingo Tank", tierBias: 2, hpMul: 1.9, speedMul: 0.82, contactDamage: 16, rangedCooldown: 0, summonCooldown: 2600, splitCount: 0 },
  microBoss: { type: "microBoss", name: "Garden Bully", tierBias: 1, hpMul: 1.55, speedMul: 1.08, contactDamage: 15, rangedCooldown: 1500, summonCooldown: 2800, splitCount: 0 },
  miniBoss: { type: "miniBoss", name: "Mini Boss", tierBias: 2, hpMul: 2.4, speedMul: 0.95, contactDamage: 18, rangedCooldown: 1200, summonCooldown: 3600, splitCount: 0 },
  boss: { type: "boss", name: "Viper King", tierBias: 4, hpMul: 4.4, speedMul: 0.88, contactDamage: 24, rangedCooldown: 900, summonCooldown: 5200, splitCount: 0 },
}

export interface LevelConfig {
  level: number
  name: string
  environment: string
  tagline: string
  waves: number
  enemyBudget: number
  foodTarget: number
  bgTop: string
  bgBottom: string
  accent: string
  eventDelay: number
  decor: "garden" | "orchard" | "frost" | "storm" | "ruins" | "lava" | "night" | "crystal" | "swamp" | "throne"
  enemyPool: EnemyType[]
  microBossWave?: number
  miniBossWave?: number
  bossWave?: number
}

export const LEVELS: LevelConfig[] = [
  { level: 1, name: "Garden Picnic", environment: "Garden", tagline: "Grass, crumbs and a first bully.", waves: 3, enemyBudget: 5, foodTarget: 7, bgTop: "#709d55", bgBottom: "#4e7b39", accent: "#d8f28c", eventDelay: 9200, decor: "garden", enemyPool: ["slither", "spitter"], microBossWave: 3 },
  { level: 2, name: "Root Maze", environment: "Roots", tagline: "Tighter wave pressure.", waves: 3, enemyBudget: 7, foodTarget: 7, bgTop: "#627b43", bgBottom: "#3f5529", accent: "#d4e278", eventDelay: 8800, decor: "garden", enemyPool: ["slither", "spitter", "charger"] },
  { level: 3, name: "Foxglove Creek", environment: "Creek", tagline: "Faster hunters and better aim checks.", waves: 4, enemyBudget: 9, foodTarget: 7, bgTop: "#4f7d6a", bgBottom: "#264337", accent: "#91f0c1", eventDelay: 8400, decor: "orchard", enemyPool: ["slither", "charger", "orbiter"] },
  { level: 4, name: "Storm Lawn", environment: "Storm", tagline: "Bird dives begin.", waves: 4, enemyBudget: 11, foodTarget: 8, bgTop: "#4f6b8a", bgBottom: "#26344d", accent: "#87bbff", eventDelay: 8000, decor: "storm", enemyPool: ["charger", "orbiter", "raptor"] },
  { level: 5, name: "Burning Orchard", environment: "Orchard", tagline: "Mid-wave mini boss starts here.", waves: 5, enemyBudget: 13, foodTarget: 8, bgTop: "#8a5329", bgBottom: "#462010", accent: "#ffb06a", eventDelay: 7700, decor: "orchard", enemyPool: ["spitter", "splitter", "raptor", "dingo"], miniBossWave: 3 },
  { level: 6, name: "Frost Hollow", environment: "Frost", tagline: "Ice items show up more often.", waves: 5, enemyBudget: 15, foodTarget: 8, bgTop: "#6ea2b1", bgBottom: "#2a4854", accent: "#a5f1ff", eventDelay: 7400, decor: "frost", enemyPool: ["orbiter", "splitter", "raptor", "dingo"], miniBossWave: 3 },
  { level: 7, name: "Moonlit Ruins", environment: "Ruins", tagline: "More ranged pressure and tanks.", waves: 6, enemyBudget: 18, foodTarget: 9, bgTop: "#54497d", bgBottom: "#241b38", accent: "#ccb2ff", eventDelay: 7100, decor: "ruins", enemyPool: ["spitter", "orbiter", "dingo", "splitter"], miniBossWave: 3 },
  { level: 8, name: "Crystal Flood", environment: "Crystal", tagline: "Reflective lanes and heavy swarms.", waves: 6, enemyBudget: 21, foodTarget: 9, bgTop: "#2f7a86", bgBottom: "#14343e", accent: "#8effff", eventDelay: 6800, decor: "crystal", enemyPool: ["charger", "orbiter", "raptor", "dingo"], miniBossWave: 3 },
  { level: 9, name: "Venom Marsh", environment: "Swamp", tagline: "Everything stacks poison pressure.", waves: 7, enemyBudget: 24, foodTarget: 9, bgTop: "#536838", bgBottom: "#202c16", accent: "#c6ff77", eventDelay: 6500, decor: "swamp", enemyPool: ["splitter", "orbiter", "raptor", "dingo"], miniBossWave: 4 },
  { level: 10, name: "Throne of Venom", environment: "Boss Arena", tagline: "Final marathon with summoned adds.", waves: 7, enemyBudget: 28, foodTarget: 10, bgTop: "#5a2323", bgBottom: "#1c0909", accent: "#ff7d7d", eventDelay: 6200, decor: "throne", enemyPool: ["spitter", "splitter", "orbiter", "raptor", "dingo"], miniBossWave: 4, bossWave: 7 },
]

export interface GameEvent {
  id: string
  name: string
  desc: string
  color: string
  duration: number
  enemySpeedMul?: number
  playerSpeedMul?: number
  foodBonus?: number
  enemyDamageMul?: number
  projectileBonus?: number
}

export const EVENTS: GameEvent[] = [
  { id: "harvest", name: "Harvest Burst", desc: "Extra food appears.", color: "#ffd966", duration: 8000, foodBonus: 4 },
  { id: "frenzy", name: "Predator Frenzy", desc: "Enemies move faster.", color: "#ff6b6b", duration: 7000, enemySpeedMul: 1.28, enemyDamageMul: 1.2 },
  { id: "tailwind", name: "Tailwind", desc: "Players move faster.", color: "#7fb7ff", duration: 7000, playerSpeedMul: 1.24 },
  { id: "supernova", name: "Supernova Nuts", desc: "Player attacks hit harder.", color: "#ffb347", duration: 6500, projectileBonus: 1.35 },
]

export const EVOLUTION_PATHS = [
  { id: "fire", name: "Ember Bow", steps: ["Cinder", "Pyre", "Sunshot"], combo: "Straight lances that end in explosive impact shots." },
  { id: "ice", name: "Frost Rail", steps: ["Needle", "Shiver", "Glacier"], combo: "Heavy slow shards with piercing cold lines." },
  { id: "seed", name: "Bramble Fan", steps: ["Sprig", "Bramble", "Hedge"], combo: "Wide thorn fans for crowd control and lane denial." },
  { id: "speed", name: "Bolt Needle", steps: ["Quickshot", "Blitz", "Rail"], combo: "Fast precision bursts with the lowest cooldown." },
  { id: "shield", name: "Walnut Guard", steps: ["Guard", "Bulwark", "Fortress"], combo: "Passive shield layers that never alter your weapon lock." },
]

export const MAX_PLAYERS = 2
export const MAX_SHIELDS = 3
export const PLAYER_MAX_STACK = 3
