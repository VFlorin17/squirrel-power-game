export type PowerId = "none" | "seeds" | "fire" | "speed" | "shield"

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
  },
  {
    id: "apple",
    name: "Apple",
    emoji: "🍎",
    color: "#e23b3b",
    power: "seeds",
    powerName: "Seed Fusion",
    description: "Build a fast burst attack.",
    heal: 8,
    stackValue: 1,
  },
  {
    id: "pepper",
    name: "Red Pepper",
    emoji: "🌶️",
    color: "#ff6b2f",
    power: "fire",
    powerName: "Fire Fusion",
    description: "Turn into a fire squirrel and evolve the flame.",
    heal: 6,
    stackValue: 1,
  },
  {
    id: "blueberry",
    name: "Blueberry",
    emoji: "🫐",
    color: "#4a6cf7",
    power: "speed",
    powerName: "Speed Fusion",
    description: "Boost movement and rapid attacks.",
    heal: 8,
    stackValue: 1,
  },
  {
    id: "walnut",
    name: "Walnut",
    emoji: "🥜",
    color: "#d7b06a",
    power: "shield",
    powerName: "Nut Guard",
    description: "Gain a shield layer and tougher fusion.",
    heal: 10,
    stackValue: 1,
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

export type EnemyType = "slither" | "spitter" | "charger" | "splitter" | "orbiter" | "raptor" | "dingo" | "miniBoss" | "boss"

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
  slither: {
    type: "slither",
    name: "Slither Snake",
    tierBias: 0,
    hpMul: 1,
    speedMul: 1,
    contactDamage: 9,
    rangedCooldown: 0,
    summonCooldown: 0,
    splitCount: 0,
  },
  spitter: {
    type: "spitter",
    name: "Spitter Snake",
    tierBias: 0,
    hpMul: 0.9,
    speedMul: 0.95,
    contactDamage: 8,
    rangedCooldown: 1800,
    summonCooldown: 0,
    splitCount: 0,
  },
  charger: {
    type: "charger",
    name: "Charger Snake",
    tierBias: 1,
    hpMul: 1.05,
    speedMul: 1.15,
    contactDamage: 14,
    rangedCooldown: 0,
    summonCooldown: 2200,
    splitCount: 0,
  },
  splitter: {
    type: "splitter",
    name: "Hydra Snake",
    tierBias: 1,
    hpMul: 1.1,
    speedMul: 0.95,
    contactDamage: 10,
    rangedCooldown: 0,
    summonCooldown: 0,
    splitCount: 2,
  },
  orbiter: {
    type: "orbiter",
    name: "Orbiter Snake",
    tierBias: 1,
    hpMul: 0.95,
    speedMul: 1.08,
    contactDamage: 9,
    rangedCooldown: 1400,
    summonCooldown: 0,
    splitCount: 0,
  },
  raptor: {
    type: "raptor",
    name: "Raptor Bird",
    tierBias: 1,
    hpMul: 0.72,
    speedMul: 1.45,
    contactDamage: 12,
    rangedCooldown: 0,
    summonCooldown: 1600,
    splitCount: 0,
  },
  dingo: {
    type: "dingo",
    name: "Dingo Tank",
    tierBias: 2,
    hpMul: 1.9,
    speedMul: 0.82,
    contactDamage: 16,
    rangedCooldown: 0,
    summonCooldown: 2600,
    splitCount: 0,
  },
  miniBoss: {
    type: "miniBoss",
    name: "Mini Boss",
    tierBias: 2,
    hpMul: 2.4,
    speedMul: 0.95,
    contactDamage: 18,
    rangedCooldown: 1200,
    summonCooldown: 3600,
    splitCount: 0,
  },
  boss: {
    type: "boss",
    name: "Viper King",
    tierBias: 4,
    hpMul: 4.4,
    speedMul: 0.88,
    contactDamage: 24,
    rangedCooldown: 900,
    summonCooldown: 5200,
    splitCount: 0,
  },
}

export interface LevelConfig {
  level: number
  name: string
  waves: number
  enemyBudget: number
  foodTarget: number
  bgTop: string
  bgBottom: string
  accent: string
  eventDelay: number
  miniBossWave?: number
  bossWave?: number
}

export const LEVELS: LevelConfig[] = [
  { level: 1, name: "Woodland Edge", waves: 3, enemyBudget: 5, foodTarget: 6, bgTop: "#537f45", bgBottom: "#2f512b", accent: "#9dde6d", eventDelay: 9000 },
  { level: 2, name: "Root Run", waves: 3, enemyBudget: 7, foodTarget: 6, bgTop: "#5d7340", bgBottom: "#3f4d28", accent: "#d2e672", eventDelay: 8600 },
  { level: 3, name: "Foxglove Hollow", waves: 4, enemyBudget: 8, foodTarget: 6, bgTop: "#5f6340", bgBottom: "#362f22", accent: "#f0cb73", eventDelay: 8200 },
  { level: 4, name: "Storm Burrow", waves: 4, enemyBudget: 10, foodTarget: 7, bgTop: "#425a7c", bgBottom: "#242d48", accent: "#7fb7ff", eventDelay: 7800 },
  { level: 5, name: "Burning Orchard", waves: 4, enemyBudget: 12, foodTarget: 7, bgTop: "#7e4426", bgBottom: "#3a1c13", accent: "#ff9a52", eventDelay: 7600, miniBossWave: 4 },
  { level: 6, name: "Moonlit Thicket", waves: 4, enemyBudget: 14, foodTarget: 7, bgTop: "#4d4174", bgBottom: "#231733", accent: "#c9a3ff", eventDelay: 7400 },
  { level: 7, name: "Crystal Creek", waves: 5, enemyBudget: 16, foodTarget: 8, bgTop: "#2f7083", bgBottom: "#163240", accent: "#87ecff", eventDelay: 7200 },
  { level: 8, name: "Twisted Canopy", waves: 5, enemyBudget: 18, foodTarget: 8, bgTop: "#45633b", bgBottom: "#1f2d1c", accent: "#7dff99", eventDelay: 7000 },
  { level: 9, name: "Rift of Fangs", waves: 5, enemyBudget: 21, foodTarget: 8, bgTop: "#652b37", bgBottom: "#260e14", accent: "#ff8da1", eventDelay: 6600 },
  { level: 10, name: "Throne of Venom", waves: 5, enemyBudget: 24, foodTarget: 9, bgTop: "#4f1f1f", bgBottom: "#190809", accent: "#ff6b6b", eventDelay: 6200, bossWave: 5 },
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

export const MAX_PLAYERS = 2
export const MAX_SHIELDS = 3
export const PLAYER_MAX_STACK = 3
