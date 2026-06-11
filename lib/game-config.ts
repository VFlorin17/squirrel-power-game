export type PowerId = "none" | "seeds" | "fire" | "speed" | "shield"

export interface FoodType {
  id: string
  name: string
  emoji: string
  color: string
  power: PowerId
  powerName: string
  description: string
  duration: number // ms the power lasts (0 = instant/no timed power)
  heal: number
}

export const FOODS: FoodType[] = [
  {
    id: "acorn",
    name: "Acorn",
    emoji: "🌰",
    color: "#8a5a2b",
    power: "none",
    powerName: "Snack",
    description: "Normal nut. Restores energy.",
    duration: 0,
    heal: 20,
  },
  {
    id: "apple",
    name: "Apple",
    emoji: "🍎",
    color: "#e23b3b",
    power: "seeds",
    powerName: "Seed Spit",
    description: "Spit a spread of 10 seeds! Same food stacks duration.",
    duration: 9000,
    heal: 10,
  },
  {
    id: "pepper",
    name: "Red Pepper",
    emoji: "🌶️",
    color: "#d12f2f",
    power: "fire",
    powerName: "Fire Breath",
    description: "Throw fireballs! Same food stacks duration.",
    duration: 9000,
    heal: 5,
  },
  {
    id: "blueberry",
    name: "Blueberry",
    emoji: "🫐",
    color: "#4a6cf7",
    power: "speed",
    powerName: "Dash",
    description: "Move much faster. Same food stacks duration.",
    duration: 8000,
    heal: 10,
  },
  {
    id: "walnut",
    name: "Walnut",
    emoji: "🥜",
    color: "#b58a4a",
    power: "shield",
    powerName: "Nut Shield",
    description: "Stacks up to 3 shields that stay on you.",
    duration: 0,
    heal: 10,
  },
]

export interface SnakeStage {
  name: string
  color: string
  colorDark: string
  speed: number
  segments: number
  segSize: number
  hp: number
}

export const SNAKE_STAGES: SnakeStage[] = [
  { name: "Garter Snake", color: "#6fae5a", colorDark: "#4d8a3c", speed: 1.5, segments: 6, segSize: 9, hp: 30 },
  { name: "Rat Snake", color: "#9aa84a", colorDark: "#6f7d2f", speed: 1.9, segments: 9, segSize: 10, hp: 50 },
  { name: "Python", color: "#c9a23a", colorDark: "#9a7820", speed: 2.3, segments: 13, segSize: 12, hp: 80 },
  { name: "Cobra", color: "#d97a2b", colorDark: "#a8531a", speed: 2.8, segments: 17, segSize: 13, hp: 120 },
  { name: "Viper King", color: "#c43a3a", colorDark: "#8f2424", speed: 3.3, segments: 22, segSize: 15, hp: 170 },
]

// Gameplay tuning
export const MAX_SHIELDS = 3
export const MAX_SNAKES = 10
export const SNAKE_EVOLVE_MS = 14000 // each snake evolves a stage every this long it survives
export const SEED_DMG = 4
export const FIRE_DMG = 11

// Fraction of the player's dash effect a snake gets when it eats a speed food
export const SNAKE_FOOD_DASH_FRACTION = 0.03

// Fusion biomes: each fusion shifts the whole look AND the dynamics of the game
export interface Biome {
  id: string
  name: string
  tagline: string
  bgTop: string
  bgBottom: string
  grass: string
  accent: string
  playerSpeedMul: number
  snakeSpeedMul: number
  friction: number // player damping per frame (lower = more slippery)
  foodTarget: number // how many foods on the field
}

export const BIOMES: Biome[] = [
  {
    id: "grove",
    name: "Verdant Grove",
    tagline: "Balanced woodland",
    bgTop: "#4a7d40",
    bgBottom: "#33602e",
    grass: "rgba(255,255,255,0.05)",
    accent: "#7fe07f",
    playerSpeedMul: 1,
    snakeSpeedMul: 1,
    friction: 0.86,
    foodTarget: 5,
  },
  {
    id: "ember",
    name: "Ember Wastes",
    tagline: "Snakes turn aggressive & fast",
    bgTop: "#7a2f1c",
    bgBottom: "#3d1410",
    grass: "rgba(255,180,80,0.07)",
    accent: "#ff7a1a",
    playerSpeedMul: 1.05,
    snakeSpeedMul: 1.35,
    friction: 0.86,
    foodTarget: 4,
  },
  {
    id: "frost",
    name: "Frost Hollow",
    tagline: "Slippery ice, everything slides",
    bgTop: "#3a6f8a",
    bgBottom: "#1f3d52",
    grass: "rgba(200,240,255,0.09)",
    accent: "#7fd6ff",
    playerSpeedMul: 1.1,
    snakeSpeedMul: 0.85,
    friction: 0.95,
    foodTarget: 5,
  },
  {
    id: "bloom",
    name: "Twilight Bloom",
    tagline: "Food blooms everywhere",
    bgTop: "#43275f",
    bgBottom: "#241038",
    grass: "rgba(255,200,255,0.07)",
    accent: "#d98fff",
    playerSpeedMul: 1,
    snakeSpeedMul: 1.1,
    friction: 0.86,
    foodTarget: 9,
  },
]

// Short, random timed events layered on top of the current biome
export interface GameEvent {
  id: string
  name: string
  desc: string
  color: string
  duration: number
}

export const EVENTS: GameEvent[] = [
  { id: "feast", name: "Acorn Feast", desc: "Food rains down!", color: "#ffd966", duration: 8000 },
  { id: "frenzy", name: "Snake Frenzy", desc: "Snakes go wild!", color: "#ff5a4a", duration: 7000 },
  { id: "swift", name: "Swift Paws", desc: "You move faster!", color: "#7fd6ff", duration: 8000 },
  { id: "lull", name: "Sleepy Snakes", desc: "Snakes slow down.", color: "#a0e0a0", duration: 7000 },
  { id: "split", name: "Hydra Hour", desc: "Slain snakes split into 3!", color: "#ff9a4a", duration: 9000 },
]
