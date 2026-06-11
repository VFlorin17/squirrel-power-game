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
    description: "Spit a spread of 10 seeds! Press SPACE.",
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
    description: "Throw fireballs! Press SPACE.",
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
    description: "Move much faster for a while.",
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
    description: "Absorb one snake hit.",
    duration: 12000,
    heal: 10,
  },
]

export const SNAKE_STAGES = [
  { name: "Garter Snake", color: "#6fae5a", speed: 1.5, segments: 6, segSize: 9 },
  { name: "Rat Snake", color: "#9aa84a", speed: 2.0, segments: 9, segSize: 10 },
  { name: "Python", color: "#c9a23a", speed: 2.5, segments: 13, segSize: 12 },
  { name: "Cobra", color: "#d97a2b", speed: 3.1, segments: 17, segSize: 13 },
  { name: "Viper King", color: "#c43a3a", speed: 3.8, segments: 22, segSize: 15 },
]
