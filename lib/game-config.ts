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
export const MAX_SNAKES = 6
export const SNAKE_EVOLVE_MS = 14000 // each snake evolves a stage every this long it survives
export const SEED_DMG = 4
export const FIRE_DMG = 11
