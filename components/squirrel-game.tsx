"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  ENEMY_ARCHETYPES,
  ENEMY_TIERS,
  EVOLUTION_PATHS,
  EVENTS,
  FOODS,
  LEVELS,
  MAX_PLAYERS,
  MAX_SHIELDS,
  PLAYER_MAX_STACK,
  type EnemyType,
  type FoodType,
  type GameEvent,
  type LevelConfig,
  type PowerId,
} from "@/lib/game-config"

const WORLD = { w: 960, h: 600 }
const ROOM_PREFIX = "squirrel-room"
const HIGHSCORE_KEY = "squirrel-fusion-highscores-v2"
const UNLOCK_KEY = "squirrel-fusion-unlocked-level-v1"

type Status = "menu" | "levelSelect" | "levelRoad" | "briefing" | "lobby" | "playing" | "paused" | "levelComplete" | "dead" | "won"
type PlayMode = "single" | "coop" | "endless"
type RoomRole = "host" | "guest" | null
type BranchHint = {
  label: string
  icon: string
  color: string
  outcome: string
}

interface Vec {
  x: number
  y: number
}

interface InputState {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  target: Vec | null
}

interface FoodItem extends Vec {
  id: number
  type: FoodType
}

interface Projectile extends Vec {
  id: number
  owner: "player" | "enemy"
  ownerId: string
  vx: number
  vy: number
  life: number
  radius: number
  color: string
  damage: number
  kind: "seed" | "fire" | "spark" | "venom" | "ice" | "obsidian"
}

interface Particle extends Vec {
  id: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

interface PlayerState extends Vec {
  id: string
  name: string
  vx: number
  vy: number
  r: number
  hp: number
  maxHp: number
  score: number
  facing: Vec
  fireStacks: number
  iceStacks: number
  seedStacks: number
  speedStacks: number
  shieldStacks: number
  attackCooldown: number
  specialCooldown: number
  hurtCooldown: number
  alive: boolean
  hitFlash: number
  isHost: boolean
  target: Vec | null
}

interface EnemyState extends Vec {
  id: string
  type: EnemyType
  tier: number
  vx: number
  vy: number
  hp: number
  maxHp: number
  size: number
  speed: number
  reload: number
  summonCooldown: number
  dash: number
  dashCooldown: number
  orbitSeed: number
  wiggle: number
  evoMeter: number
  fireLevel: number
  iceLevel: number
  seedLevel: number
  speedLevel: number
  hitFlash: number
  heading: number
  slowTimer: number
}

interface SpawnOrder {
  at: number
  type: EnemyType
  tier: number
}

interface GameState {
  players: PlayerState[]
  foods: FoodItem[]
  enemies: EnemyState[]
  projectiles: Projectile[]
  particles: Particle[]
  levelIndex: number
  wave: number
  waveSpawnTotal: number
  waveDefeated: number
  pendingSpawns: SpawnOrder[]
  nextWaveAt: number
  levelPauseUntil: number
  sharedScore: number
  activeEvent: GameEvent | null
  eventUntil: number
  nextEventAt: number
  banner: string
  bannerUntil: number
  mode: PlayMode
  roomCode: string | null
  endlessWaveBest: number
}

interface RoomMember {
  id: string
  name: string
  isHost: boolean
}

interface HighscoreEntry {
  id: string
  name: string
  score: number
  level: number
  mode: PlayMode
  result: "won" | "dead"
  wave: number
  date: string
}

type RoomMessage =
  | { type: "join"; member: RoomMember }
  | { type: "roster"; members: RoomMember[] }
  | { type: "leave"; memberId: string }
  | { type: "input"; memberId: string; input: InputState }
  | { type: "start"; state: GameState }
  | { type: "state"; state: GameState; status: Status }

const emptyInput = (): InputState => ({ up: false, down: false, left: false, right: false, target: null })

let nextId = 1
const uid = () => `${Date.now()}-${nextId++}`
const ROAD_CARD_WIDTH = 320

const BRANCH_META: Record<Exclude<PowerId, "none">, { label: string; icon: string; color: string; food: string }> = {
  fire: { label: "Fire", icon: "F", color: "#ff7b3a", food: "Pepper" },
  ice: { label: "Ice", icon: "I", color: "#91eaff", food: "Ice Melon" },
  obsidian: { label: "Obsidian", icon: "O", color: "#5b5b78", food: "Pepper + Ice" },
  seeds: { label: "Seed", icon: "S", color: "#f2ce68", food: "Apple" },
  speed: { label: "Speed", icon: "Z", color: "#79cfff", food: "Blueberry" },
  shield: { label: "Guard", icon: "G", color: "#eccd8d", food: "Walnut" },
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function norm(x: number, y: number) {
  const d = Math.hypot(x, y) || 1
  return { x: x / d, y: y / d }
}

function choose<T>(list: T[]) {
  return list[Math.floor(Math.random() * list.length)]
}

function stackForPower(player: PlayerState, power: PowerId) {
  if (power === "fire") return player.fireStacks
  if (power === "ice") return player.iceStacks
  if (power === "seeds") return player.seedStacks
  if (power === "speed") return player.speedStacks
  if (power === "shield") return player.shieldStacks
  if (power === "obsidian") return Math.min(PLAYER_MAX_STACK, Math.max(player.fireStacks, player.iceStacks))
  return 0
}

function dominantPower(player: PlayerState): PowerId {
  if (player.fireStacks > 0 && player.iceStacks > 0) return "obsidian"
  const entries: [PowerId, number][] = [
    ["fire", player.fireStacks],
    ["ice", player.iceStacks],
    ["seeds", player.seedStacks],
    ["speed", player.speedStacks],
    ["shield", player.shieldStacks],
  ]
  const top = entries.sort((a, b) => b[1] - a[1])[0]
  return top[1] > 0 ? top[0] : "none"
}

function powerLabel(player: PlayerState) {
  const power = dominantPower(player)
  const stacks =
    power === "fire"
      ? player.fireStacks
      : power === "ice"
        ? player.iceStacks
        : power === "obsidian"
          ? Math.min(3, Math.max(player.fireStacks, player.iceStacks))
      : power === "seeds"
        ? player.seedStacks
        : power === "speed"
          ? player.speedStacks
          : power === "shield"
            ? player.shieldStacks
            : 0
  if (power === "none") return "Plain Paws"
  if (power === "fire") return ["Spark", "Flame", "Inferno"][stacks - 1] ?? "Inferno"
  if (power === "ice") return ["Chill", "Freeze", "Blizzard"][stacks - 1] ?? "Blizzard"
  if (power === "obsidian") {
    const obsidianLevel = Math.min(3, Math.max(player.fireStacks, player.iceStacks))
    return ["Ember Frost", "Glass Fang", "Obsidian Core"][obsidianLevel - 1] ?? "Obsidian Core"
  }
  if (power === "seeds") return ["Seedling", "Volley", "Thornstorm"][stacks - 1] ?? "Thornstorm"
  if (power === "speed") return ["Dash", "Blitz", "Storm Paw"][stacks - 1] ?? "Storm Paw"
  return ["Guard", "Bulwark", "Fortress"][stacks - 1] ?? "Fortress"
}

function currentLevel(state: GameState): LevelConfig {
  return LEVELS[Math.min(state.levelIndex, LEVELS.length - 1)]
}

function playerColor(player: PlayerState) {
  const power = dominantPower(player)
  if (power === "fire") return ["#e69138", "#f06b2f", "#ff4123"][player.fireStacks - 1] ?? "#ff4123"
  if (power === "ice") return ["#95e6ff", "#62d9ff", "#b5f5ff"][player.iceStacks - 1] ?? "#b5f5ff"
  if (power === "obsidian") return ["#4d4d5f", "#303046", "#191923"][Math.min(3, Math.max(player.fireStacks, player.iceStacks)) - 1] ?? "#191923"
  if (power === "seeds") return ["#b17a3f", "#c89a41", "#e1c64d"][player.seedStacks - 1] ?? "#e1c64d"
  if (power === "speed") return ["#5f8dff", "#3f7dff", "#6bc9ff"][player.speedStacks - 1] ?? "#6bc9ff"
  if (power === "shield") return ["#b18d56", "#d5b06c", "#f0d58f"][player.shieldStacks - 1] ?? "#f0d58f"
  return "#d38a3f"
}

function clearOffensiveFusions(player: PlayerState) {
  player.fireStacks = 0
  player.iceStacks = 0
  player.seedStacks = 0
  player.speedStacks = 0
}

function fusionHint(player: PlayerState) {
  const power = dominantPower(player)
  if (power === "none") return "Pick a starter food to lock a weapon branch. Walnut always stays as defense."
  if (power === "fire") {
    if (player.fireStacks < PLAYER_MAX_STACK) return "Keep taking Pepper to push Fire weapon damage and spread."
    return "Fire is capped. Ice Melon opens Obsidian and side foods trigger mini powers."
  }
  if (power === "ice") {
    if (player.iceStacks < PLAYER_MAX_STACK) return "Keep taking Ice Melon to deepen slow and freeze pressure."
    return "Ice is capped. Pepper opens Obsidian and other foods trigger mini powers."
  }
  if (power === "obsidian") return "Pepper or Ice Melon both feed Obsidian now. Side foods fire mini effects."
  if (power === "seeds") return "Apple boosts spread and crowd control. Side foods wake mini powers when capped."
  if (power === "speed") return "Blueberry sharpens cadence and reach. Side foods wake mini powers when capped."
  return "Walnut is passive armor. It never breaks your main branch."
}

function miniPowerText(foodPower: PowerId) {
  if (foodPower === "fire") return "Burn pulse"
  if (foodPower === "ice") return "Slow burst"
  if (foodPower === "seeds") return "Seed nova"
  if (foodPower === "speed") return "Dash surge"
  return "Guard"
}

function fusionCompass(player: PlayerState): { center: BranchHint; branches: [BranchHint, BranchHint, BranchHint] } {
  const active = dominantPower(player)
  const activeStack = stackForPower(player, active)

  if (active === "none") {
    return {
      center: { label: "Plain Paws", icon: "P", color: "#d7a46a", outcome: "Pick a path" },
      branches: [
        { label: "Pepper", icon: "F", color: BRANCH_META.fire.color, outcome: "Start Fire" },
        { label: "Apple", icon: "S", color: BRANCH_META.seeds.color, outcome: "Start Seed" },
        { label: "Blueberry", icon: "Z", color: BRANCH_META.speed.color, outcome: "Start Speed" },
      ],
    }
  }

  if (active === "fire") {
    return {
      center: { label: powerLabel(player), icon: BRANCH_META.fire.icon, color: BRANCH_META.fire.color, outcome: `Tier ${activeStack}/3` },
      branches: [
        { label: "Pepper", icon: "F", color: BRANCH_META.fire.color, outcome: activeStack < 3 ? "Upgrade Fire" : "Inferno blast" },
        { label: "Ice Melon", icon: "I", color: BRANCH_META.ice.color, outcome: activeStack < 3 ? "Unlock at max" : "Shift to Obsidian" },
        { label: "Side food", icon: "+", color: "#f1d79a", outcome: activeStack < 3 ? "Hold branch" : "Mini powers" },
      ],
    }
  }

  if (active === "ice") {
    return {
      center: { label: powerLabel(player), icon: BRANCH_META.ice.icon, color: BRANCH_META.ice.color, outcome: `Tier ${activeStack}/3` },
      branches: [
        { label: "Ice Melon", icon: "I", color: BRANCH_META.ice.color, outcome: activeStack < 3 ? "Upgrade Ice" : "Deep slow" },
        { label: "Pepper", icon: "F", color: BRANCH_META.fire.color, outcome: activeStack < 3 ? "Unlock at max" : "Shift to Obsidian" },
        { label: "Side food", icon: "+", color: "#f1d79a", outcome: activeStack < 3 ? "Hold branch" : "Mini powers" },
      ],
    }
  }

  if (active === "obsidian") {
    return {
      center: { label: powerLabel(player), icon: BRANCH_META.obsidian.icon, color: BRANCH_META.obsidian.color, outcome: `Tier ${activeStack}/3` },
      branches: [
        { label: "Pepper", icon: "F", color: BRANCH_META.fire.color, outcome: "Feed Obsidian" },
        { label: "Ice Melon", icon: "I", color: BRANCH_META.ice.color, outcome: "Feed Obsidian" },
        { label: "Side food", icon: "+", color: "#f1d79a", outcome: "Mini powers" },
      ],
    }
  }

  if (active === "seeds") {
    return {
      center: { label: powerLabel(player), icon: BRANCH_META.seeds.icon, color: BRANCH_META.seeds.color, outcome: `Tier ${activeStack}/3` },
      branches: [
        { label: "Apple", icon: "S", color: BRANCH_META.seeds.color, outcome: activeStack < 3 ? "Upgrade Seed" : "Wider spread" },
        { label: "Pepper", icon: "F", color: BRANCH_META.fire.color, outcome: activeStack < 3 ? "Wait for max" : miniPowerText("fire") },
        { label: "Ice Melon", icon: "I", color: BRANCH_META.ice.color, outcome: activeStack < 3 ? "Wait for max" : miniPowerText("ice") },
      ],
    }
  }

  if (active === "speed") {
    return {
      center: { label: powerLabel(player), icon: BRANCH_META.speed.icon, color: BRANCH_META.speed.color, outcome: `Tier ${activeStack}/3` },
      branches: [
        { label: "Blueberry", icon: "Z", color: BRANCH_META.speed.color, outcome: activeStack < 3 ? "Upgrade Speed" : "Long reach" },
        { label: "Pepper", icon: "F", color: BRANCH_META.fire.color, outcome: activeStack < 3 ? "Wait for max" : miniPowerText("fire") },
        { label: "Apple", icon: "S", color: BRANCH_META.seeds.color, outcome: activeStack < 3 ? "Wait for max" : miniPowerText("seeds") },
      ],
    }
  }

  return {
    center: { label: powerLabel(player), icon: BRANCH_META.shield.icon, color: BRANCH_META.shield.color, outcome: `Tier ${activeStack}/3` },
    branches: [
      { label: "Walnut", icon: "G", color: BRANCH_META.shield.color, outcome: "More armor" },
      { label: "Pepper", icon: "F", color: BRANCH_META.fire.color, outcome: "Start branch" },
      { label: "Ice Melon", icon: "I", color: BRANCH_META.ice.color, outcome: "Start branch" },
    ],
  }
}

type PickupBonus = "none" | "slowBurst" | "burnPulse" | "speedBurst" | "seedNova"

function loadUnlockedLevel() {
  if (typeof window === "undefined") return 1
  const raw = window.localStorage.getItem(UNLOCK_KEY)
  const parsed = raw ? Number(raw) : 1
  return Number.isFinite(parsed) ? clamp(parsed, 1, LEVELS.length) : 1
}

function saveUnlockedLevel(level: number) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(UNLOCK_KEY, String(clamp(level, 1, LEVELS.length)))
}

function pickFood(levelIndex = 0): FoodType {
  const level = LEVELS[Math.min(levelIndex, LEVELS.length - 1)]
  const foods = FOODS.map((food) => {
    let weight = food.spawnWeight
    if (food.power === "ice" && level.decor === "frost") weight += 2
    if ((food.power === "fire" || food.power === "ice") && level.level >= 7) weight += 1
    return { food, weight }
  })
  const total = foods.reduce((sum, item) => sum + item.weight, 0)
  let roll = rand(0, total)
  for (const item of foods) {
    roll -= item.weight
    if (roll <= 0) return item.food
  }
  return foods[foods.length - 1].food
}

function spawnFood(levelIndex = 0): FoodItem {
  return {
    id: nextId++,
    type: pickFood(levelIndex),
    x: rand(60, WORLD.w - 60),
    y: rand(60, WORLD.h - 60),
  }
}

function spawnOffscreen(): Vec {
  const edge = Math.floor(rand(0, 4))
  if (edge === 0) return { x: rand(-120, -40), y: rand(40, WORLD.h - 40) }
  if (edge === 1) return { x: rand(WORLD.w + 40, WORLD.w + 120), y: rand(40, WORLD.h - 40) }
  if (edge === 2) return { x: rand(40, WORLD.w - 40), y: rand(-120, -40) }
  return { x: rand(40, WORLD.w - 40), y: rand(WORLD.h + 40, WORLD.h + 120) }
}

function createEnemy(type: EnemyType, tier: number): EnemyState {
  const spawn = spawnOffscreen()
  const clampedTier = clamp(tier, 0, ENEMY_TIERS.length - 1)
  const base = ENEMY_TIERS[clampedTier]
  const archetype = ENEMY_ARCHETYPES[type]
  return {
    id: uid(),
    type,
    tier: clampedTier,
    vx: 0,
    vy: 0,
    hp: base.hp * archetype.hpMul,
    maxHp: base.hp * archetype.hpMul,
    size: base.size + (type === "boss" ? 18 : type === "miniBoss" ? 8 : 0),
    speed: base.speed * archetype.speedMul,
    x: spawn.x,
    y: spawn.y,
    reload: archetype.rangedCooldown ? rand(250, archetype.rangedCooldown) : 0,
    summonCooldown: archetype.summonCooldown ? rand(1200, archetype.summonCooldown) : 0,
    dash: 0,
    dashCooldown: rand(1400, 2600),
    orbitSeed: rand(0, Math.PI * 2),
    wiggle: rand(0, Math.PI * 2),
    evoMeter: 0,
    fireLevel: 0,
    iceLevel: 0,
    seedLevel: 0,
    speedLevel: 0,
    hitFlash: 0,
    heading: rand(0, Math.PI * 2),
    slowTimer: 0,
  }
}

function evolveEnemy(enemy: EnemyState) {
  if (enemy.tier >= ENEMY_TIERS.length - 1) return
  enemy.tier += 1
  const base = ENEMY_TIERS[enemy.tier]
  const archetype = ENEMY_ARCHETYPES[enemy.type]
  enemy.maxHp = base.hp * archetype.hpMul
  enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * 0.45)
  enemy.size = base.size + (enemy.type === "boss" ? 18 : enemy.type === "miniBoss" ? 8 : 0)
  enemy.speed = base.speed * archetype.speedMul
}

function createPlayers(mode: PlayMode, members: RoomMember[]): PlayerState[] {
  const used = mode === "coop" ? members.slice(0, MAX_PLAYERS) : members.slice(0, 1)
  const fallback = used.length > 0 ? used : [{ id: uid(), name: "Player", isHost: true }]
  return fallback.map((member, index) => ({
    id: member.id,
    name: member.name,
    isHost: member.isHost,
    x: WORLD.w / 2 + (index === 0 ? -60 : 60),
    y: WORLD.h / 2,
    vx: 0,
    vy: 0,
    r: 16,
    hp: 100,
    maxHp: 100,
    score: 0,
    facing: { x: 1, y: 0 },
    fireStacks: 0,
    iceStacks: 0,
    seedStacks: 0,
    speedStacks: 0,
    shieldStacks: 0,
    attackCooldown: 0,
    specialCooldown: 0,
    hurtCooldown: 0,
    alive: true,
    hitFlash: 0,
    target: null,
  }))
}

function makeGameState(mode: PlayMode, members: RoomMember[], roomCode: string | null, startLevelIndex = 0): GameState {
  const level = LEVELS[startLevelIndex]
  return {
    players: createPlayers(mode, members),
    foods: Array.from({ length: level.foodTarget }, () => spawnFood(startLevelIndex)),
    enemies: [],
    projectiles: [],
    particles: [],
    levelIndex: startLevelIndex,
    wave: 0,
    waveSpawnTotal: 0,
    waveDefeated: 0,
    pendingSpawns: [],
    nextWaveAt: performance.now() + 1000,
    levelPauseUntil: performance.now() + 1200,
    sharedScore: 0,
    activeEvent: null,
    eventUntil: 0,
    nextEventAt: performance.now() + level.eventDelay,
    banner: `${level.name}`,
    bannerUntil: performance.now() + 2400,
    mode,
    roomCode,
    endlessWaveBest: 0,
  }
}

function buildWave(level: LevelConfig, wave: number): SpawnOrder[] {
  const costMap: Record<EnemyType, number> = {
    slither: 1,
    spitter: 2,
    charger: 2,
    splitter: 3,
    orbiter: 3,
    raptor: 2,
    dingo: 4,
    microBoss: 4,
    miniBoss: 5,
    boss: 8,
  }
  const pool = level.enemyPool.map((type) => ({ type, cost: costMap[type] }))

  const orders: SpawnOrder[] = []
  let budget = level.enemyBudget + wave * 2

  if (level.microBossWave === wave) {
    orders.push({ at: 0, type: "microBoss", tier: clamp(level.level - 1, 1, 3) })
    budget = Math.max(0, budget - 4)
  }
  if (level.miniBossWave === wave) {
    orders.push({ at: 0, type: "miniBoss", tier: clamp(2 + Math.floor(level.level / 4), 2, 4) })
    budget = Math.max(0, budget - 5)
  }
  if (level.bossWave === wave) {
    orders.push({ at: 0, type: "boss", tier: 4 })
    budget = Math.max(0, budget - 8)
  }

  while (budget > 0) {
    const options = pool.filter((item) => item.cost <= budget)
    if (options.length === 0) break
    const pick = choose(options)
    const tier = clamp(Math.floor((level.level - 1) / 2) + rand(0, 1.5) + ENEMY_ARCHETYPES[pick.type].tierBias - 1, 0, 4)
    orders.push({ at: 0, type: pick.type, tier: Math.round(tier) })
    budget -= pick.cost
  }

  return orders.map((order, index) => ({
    ...order,
    at: index * rand(240, 520),
  }))
}

function addParticles(state: GameState, x: number, y: number, color: string, count = 12, size = 3) {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(0.4, 2.4)
    state.particles.push({
      id: nextId++,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      maxLife: 1,
      color,
      size: rand(size * 0.5, size),
    })
  }
}

function dropWaveReward(state: GameState, focus: Vec) {
  for (let i = 0; i < 3; i++) {
    state.foods.push({
      id: nextId++,
      type: i === 0 ? pickFood(state.levelIndex + 1) : pickFood(state.levelIndex),
      x: clamp(focus.x + rand(-70, 70), 50, WORLD.w - 50),
      y: clamp(focus.y + rand(-70, 70), 50, WORLD.h - 50),
    })
  }
}

function nearestPlayer(enemy: EnemyState, players: PlayerState[]) {
  let best: PlayerState | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const player of players) {
    if (!player.alive) continue
    const d = Math.hypot(player.x - enemy.x, player.y - enemy.y)
    if (d < bestDist) {
      best = player
      bestDist = d
    }
  }
  return best
}

function nearestEnemy(player: PlayerState, enemies: EnemyState[]) {
  let best: EnemyState | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const enemy of enemies) {
    const d = Math.hypot(player.x - enemy.x, player.y - enemy.y)
    if (d < bestDist) {
      best = enemy
      bestDist = d
    }
  }
  return best
}

function aimInaccuracy(distance: number, targetSpeed: number, base = 0.04) {
  return base + Math.min(0.34, distance / 1400) + Math.min(0.22, targetSpeed / 18)
}

function aimWithMiss(
  from: Vec,
  target: Vec,
  targetVelocity: Vec,
  projectileSpeed: number,
  distanceBase = 0.04,
) {
  const dx = target.x - from.x
  const dy = target.y - from.y
  const distance = Math.hypot(dx, dy)
  const travelTime = distance / Math.max(1, projectileSpeed)
  const predicted = {
    x: target.x + targetVelocity.x * travelTime * 1.4,
    y: target.y + targetVelocity.y * travelTime * 1.4,
  }
  const miss = aimInaccuracy(distance, Math.hypot(targetVelocity.x, targetVelocity.y), distanceBase)
  const offset = {
    x: rand(-distance * miss, distance * miss),
    y: rand(-distance * miss, distance * miss),
  }
  return norm(predicted.x + offset.x - from.x, predicted.y + offset.y - from.y)
}

function queueBanner(state: GameState, text: string, now: number) {
  state.banner = text
  state.bannerUntil = now + 2300
}

function playerShoot(state: GameState, player: PlayerState, now: number) {
  if (!player.alive || player.attackCooldown > 0) return
  const target = nearestEnemy(player, state.enemies)
  if (!target) return
  const activeEvent = state.activeEvent
  const projectileMul = activeEvent?.projectileBonus ?? 1
  const power = dominantPower(player)
  const referenceSpeed =
    power === "fire"
      ? 8.8
      : power === "ice"
        ? 8.4
        : power === "obsidian"
          ? 10.2
          : power === "seeds"
            ? 9.2
            : power === "speed"
              ? 10.5
              : power === "shield"
                ? 7.4
                : 8
  const dir = aimWithMiss(player, target, { x: target.vx, y: target.vy }, referenceSpeed, 0.02)
  player.facing = dir

  if (power === "fire") {
    const count = Math.max(1, player.fireStacks)
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.18
      const angle = Math.atan2(dir.y, dir.x) + spread
      state.projectiles.push({
        id: nextId++,
        owner: "player",
        ownerId: player.id,
        x: player.x,
        y: player.y,
        vx: Math.cos(angle) * 8.8,
        vy: Math.sin(angle) * 8.8,
        life: 1500,
        radius: 6 + player.fireStacks,
        color: "#ff6b2f",
        damage: (8 + player.fireStacks * 4) * projectileMul,
        kind: "fire",
      })
    }
    player.attackCooldown = 260
  } else if (power === "ice") {
    const count = Math.max(1, player.iceStacks)
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.12
      const angle = Math.atan2(dir.y, dir.x) + spread
      state.projectiles.push({
        id: nextId++,
        owner: "player",
        ownerId: player.id,
        x: player.x,
        y: player.y,
        vx: Math.cos(angle) * 8.4,
        vy: Math.sin(angle) * 8.4,
        life: 1500,
        radius: 5 + player.iceStacks,
        color: "#9aefff",
        damage: (5 + player.iceStacks * 2) * projectileMul,
        kind: "ice",
      })
    }
    player.attackCooldown = 280
  } else if (power === "obsidian") {
    const obsidianLevel = Math.min(3, Math.max(player.fireStacks, player.iceStacks))
    for (let i = 0; i < obsidianLevel; i++) {
      const spread = (i - (obsidianLevel - 1) / 2) * 0.07
      const angle = Math.atan2(dir.y, dir.x) + spread
      state.projectiles.push({
        id: nextId++,
        owner: "player",
        ownerId: player.id,
        x: player.x,
        y: player.y,
        vx: Math.cos(angle) * 10.2,
        vy: Math.sin(angle) * 10.2,
        life: 1500,
        radius: 5.5,
        color: "#222230",
        damage: (8 + obsidianLevel * 3) * projectileMul,
        kind: "obsidian",
      })
    }
    player.attackCooldown = 240
  } else if (power === "seeds") {
    const count = 3 + player.seedStacks * 2
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.08
      const angle = Math.atan2(dir.y, dir.x) + spread
      state.projectiles.push({
        id: nextId++,
        owner: "player",
        ownerId: player.id,
        x: player.x,
        y: player.y,
        vx: Math.cos(angle) * 9.2,
        vy: Math.sin(angle) * 9.2,
        life: 1500,
        radius: 3.6,
        color: "#e8c96f",
        damage: (4 + player.seedStacks * 2) * projectileMul,
        kind: "seed",
      })
    }
    player.attackCooldown = 330
  } else if (power === "speed") {
    state.projectiles.push({
      id: nextId++,
      owner: "player",
      ownerId: player.id,
      x: player.x,
      y: player.y,
      vx: dir.x * 10.5,
      vy: dir.y * 10.5,
      life: 1500,
      radius: 4.2,
      color: "#6bc9ff",
      damage: (5 + player.speedStacks * 2) * projectileMul,
      kind: "spark",
    })
    player.attackCooldown = 180
  } else if (power === "shield") {
    state.projectiles.push({
      id: nextId++,
      owner: "player",
      ownerId: player.id,
      x: player.x,
      y: player.y,
      vx: dir.x * 7.4,
      vy: dir.y * 7.4,
      life: 1500,
      radius: 6.5,
      color: "#f0d58f",
      damage: (6 + player.shieldStacks * 2) * projectileMul,
      kind: "seed",
    })
    player.attackCooldown = 320
  } else {
    state.projectiles.push({
      id: nextId++,
      owner: "player",
      ownerId: player.id,
      x: player.x,
      y: player.y,
      vx: dir.x * 8,
      vy: dir.y * 8,
      life: 1500,
      radius: 4,
      color: "#d5bb7a",
      damage: 5 * projectileMul,
      kind: "seed",
    })
    player.attackCooldown = 360
  }

  if (power === "fire" && player.fireStacks >= 3 && player.specialCooldown <= 0) {
    player.specialCooldown = 3200
    addParticles(state, player.x, player.y, "#ff6b2f", 18, 4)
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10
      state.projectiles.push({
        id: nextId++,
        owner: "player",
        ownerId: player.id,
        x: player.x,
        y: player.y,
        vx: Math.cos(angle) * 6,
        vy: Math.sin(angle) * 6,
        life: 900,
        radius: 5,
        color: "#ff9152",
        damage: 5 * projectileMul,
        kind: "fire",
      })
    }
  }
}

function playerEatFood(player: PlayerState, food: FoodType): PickupBonus {
  player.hp = Math.min(player.maxHp, player.hp + food.heal)
  if (food.power === "shield") {
    player.shieldStacks = clamp(player.shieldStacks + food.stackValue, 0, MAX_SHIELDS)
    return "none"
  }
  if (food.power === "none") return "none"

  const active = dominantPower(player)
  if (active === "none") {
    clearOffensiveFusions(player)
    if (food.power === "fire") player.fireStacks = 1
    else if (food.power === "ice") player.iceStacks = 1
    else if (food.power === "seeds") player.seedStacks = 1
    else if (food.power === "speed") player.speedStacks = 1
    return "none"
  }

  if (active === "fire") {
    if (food.power === "fire") player.fireStacks = clamp(player.fireStacks + 1, 0, PLAYER_MAX_STACK)
    else if (food.power === "ice" && player.fireStacks >= PLAYER_MAX_STACK) player.iceStacks = 1
    else if (player.fireStacks >= PLAYER_MAX_STACK) {
      if (food.power === "ice") return "slowBurst"
      if (food.power === "speed") return "speedBurst"
      if (food.power === "seeds") return "seedNova"
    }
    return "none"
  }

  if (active === "ice") {
    if (food.power === "ice") player.iceStacks = clamp(player.iceStacks + 1, 0, PLAYER_MAX_STACK)
    else if (food.power === "fire" && player.iceStacks >= PLAYER_MAX_STACK) player.fireStacks = 1
    else if (player.iceStacks >= PLAYER_MAX_STACK) {
      if (food.power === "fire") return "burnPulse"
      if (food.power === "speed") return "speedBurst"
      if (food.power === "seeds") return "seedNova"
    }
    return "none"
  }

  if (active === "obsidian") {
    if (food.power === "fire" || food.power === "ice") {
      const next = clamp(Math.max(player.fireStacks, player.iceStacks) + 1, 1, PLAYER_MAX_STACK)
      player.fireStacks = next
      player.iceStacks = next
    } else if (food.power === "speed") {
      return "speedBurst"
    } else if (food.power === "seeds") {
      return "seedNova"
    }
    return "none"
  }

  if (active === "seeds") {
    if (food.power === "seeds") player.seedStacks = clamp(player.seedStacks + 1, 0, PLAYER_MAX_STACK)
    else if (player.seedStacks >= PLAYER_MAX_STACK) {
      if (food.power === "fire") return "burnPulse"
      if (food.power === "ice") return "slowBurst"
      if (food.power === "speed") return "speedBurst"
    }
    return "none"
  }

  if (active === "speed") {
    if (food.power === "speed") player.speedStacks = clamp(player.speedStacks + 1, 0, PLAYER_MAX_STACK)
    else if (player.speedStacks >= PLAYER_MAX_STACK) {
      if (food.power === "fire") return "burnPulse"
      if (food.power === "ice") return "slowBurst"
      if (food.power === "seeds") return "seedNova"
    }
  }

  return "none"
}

function enemyEatFood(enemy: EnemyState, food: FoodType) {
  enemy.hp = Math.min(enemy.maxHp, enemy.hp + food.heal * 0.7)
  if (food.power === "fire") {
    enemy.fireLevel = clamp(enemy.fireLevel + 1, 0, 3)
    enemy.evoMeter += 1
  } else if (food.power === "ice") {
    enemy.iceLevel = clamp(enemy.iceLevel + 1, 0, 3)
    enemy.evoMeter += 1
  } else if (food.power === "seeds") {
    enemy.seedLevel = clamp(enemy.seedLevel + 1, 0, 3)
    enemy.evoMeter += 1
  } else if (food.power === "speed") {
    enemy.speedLevel = clamp(enemy.speedLevel + 1, 0, 3)
    enemy.evoMeter += 1
  } else if (food.power === "shield") {
    enemy.maxHp += 4
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + 8)
  }

  if (enemy.evoMeter >= 2) {
    enemy.evoMeter = 0
    evolveEnemy(enemy)
  }
}

function enemyShoot(state: GameState, enemy: EnemyState, target: PlayerState) {
  const shotSpeed = 5.2 + enemy.seedLevel * 0.35
  const dir = aimWithMiss(enemy, target, { x: target.vx, y: target.vy }, shotSpeed, 0.05)
  const damageMul = 1 + enemy.fireLevel * 0.15
  const count = enemy.type === "boss" ? 3 : enemy.type === "miniBoss" ? 2 : 1
  for (let i = 0; i < count; i++) {
    const spread = (i - (count - 1) / 2) * 0.16
    const angle = Math.atan2(dir.y, dir.x) + spread
    state.projectiles.push({
      id: nextId++,
      owner: "enemy",
      ownerId: enemy.id,
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(angle) * shotSpeed,
      vy: Math.sin(angle) * shotSpeed,
      life: 1500,
      radius: enemy.type === "boss" ? 7 : 5,
      color: enemy.fireLevel > 0 ? "#ff7d4a" : "#7fc46d",
      damage: (enemy.type === "boss" ? 13 : enemy.type === "miniBoss" ? 9 : 6) * damageMul,
      kind: "venom",
    })
  }
}

function bossRadial(state: GameState, enemy: EnemyState) {
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 * i) / 12
    state.projectiles.push({
      id: nextId++,
      owner: "enemy",
      ownerId: enemy.id,
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(angle) * 4.8,
      vy: Math.sin(angle) * 4.8,
      life: 1500,
      radius: 6,
      color: "#ff5e5e",
      damage: 8,
      kind: "venom",
    })
  }
}

function drawSnake(ctx: CanvasRenderingContext2D, enemy: EnemyState, now: number) {
  const tier = ENEMY_TIERS[enemy.tier]
  if (enemy.type === "raptor") {
    ctx.save()
    ctx.translate(enemy.x, enemy.y)
    ctx.rotate(enemy.heading)
    ctx.fillStyle = "rgba(0,0,0,0.22)"
    ctx.beginPath()
    ctx.ellipse(3, 12, enemy.size, 5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = enemy.hitFlash > 0.1 ? "#fff5dd" : "#6e4b1f"
    ctx.beginPath()
    ctx.ellipse(0, 0, enemy.size * 0.95, enemy.size * 0.65, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#c6923e"
    ctx.beginPath()
    ctx.moveTo(-enemy.size * 0.1, 0)
    ctx.lineTo(-enemy.size * 1.3, -enemy.size * 0.7)
    ctx.lineTo(-enemy.size * 0.45, -enemy.size * 0.1)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(-enemy.size * 0.1, 0)
    ctx.lineTo(-enemy.size * 1.3, enemy.size * 0.7)
    ctx.lineTo(-enemy.size * 0.45, enemy.size * 0.1)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = "#f1d59d"
    ctx.beginPath()
    ctx.arc(enemy.size * 0.72, 0, enemy.size * 0.44, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#d67c1f"
    ctx.beginPath()
    ctx.moveTo(enemy.size * 1.05, 0)
    ctx.lineTo(enemy.size * 1.55, -3)
    ctx.lineTo(enemy.size * 1.55, 3)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    return
  }

  if (enemy.type === "dingo") {
    ctx.save()
    ctx.translate(enemy.x, enemy.y)
    ctx.rotate(enemy.heading)
    ctx.fillStyle = "rgba(0,0,0,0.22)"
    ctx.beginPath()
    ctx.ellipse(3, 14, enemy.size * 1.05, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    const body = ctx.createLinearGradient(-enemy.size, 0, enemy.size, 0)
    body.addColorStop(0, "#7a5734")
    body.addColorStop(1, "#b67b46")
    ctx.fillStyle = enemy.hitFlash > 0.1 ? "#fff5dd" : body
    ctx.beginPath()
    ctx.ellipse(-2, 0, enemy.size * 1.05, enemy.size * 0.72, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#cda16b"
    ctx.beginPath()
    ctx.arc(enemy.size * 0.78, -1, enemy.size * 0.52, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#6b431f"
    ctx.beginPath()
    ctx.moveTo(enemy.size * 0.75, -enemy.size * 0.45)
    ctx.lineTo(enemy.size * 0.32, -enemy.size * 1.05)
    ctx.lineTo(enemy.size * 0.95, -enemy.size * 0.65)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(enemy.size * 0.52, enemy.size * 0.42)
    ctx.lineTo(enemy.size * 0.98, enemy.size * 0.88)
    ctx.lineTo(enemy.size * 0.9, enemy.size * 0.28)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = "#1f1308"
    ctx.beginPath()
    ctx.arc(enemy.size * 1.02, -2, 1.8, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }

  const facing = enemy.heading
  const bodyLength = enemy.type === "boss" ? 10 : enemy.type === "miniBoss" ? 8 : 6
  const bodyGap = enemy.size * 0.9

  ctx.save()
  ctx.translate(enemy.x, enemy.y)

  ctx.fillStyle = "rgba(0,0,0,0.22)"
  for (let i = bodyLength - 1; i >= 0; i--) {
    const wave = Math.sin(now * 0.012 + enemy.wiggle + i * 0.68) * enemy.size * 0.34
    const tx = -Math.cos(facing) * i * bodyGap + Math.cos(facing + Math.PI / 2) * wave
    const ty = -Math.sin(facing) * i * bodyGap + Math.sin(facing + Math.PI / 2) * wave
    const r = enemy.size * (1 - i / (bodyLength * 1.8))
    ctx.beginPath()
    ctx.arc(tx + 3, ty + 4, r, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = bodyLength - 1; i >= 0; i--) {
    const wave = Math.sin(now * 0.012 + enemy.wiggle + i * 0.68) * enemy.size * 0.34
    const tx = -Math.cos(facing) * i * bodyGap + Math.cos(facing + Math.PI / 2) * wave
    const ty = -Math.sin(facing) * i * bodyGap + Math.sin(facing + Math.PI / 2) * wave
    const r = enemy.size * (1 - i / (bodyLength * 1.8))
    const body = ctx.createRadialGradient(tx - r * 0.35, ty - r * 0.35, 1, tx, ty, r)
    body.addColorStop(0, enemy.hitFlash > 0.15 ? "#fff4dc" : tier.color)
    body.addColorStop(1, tier.colorDark)
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.arc(tx, ty, r, 0, Math.PI * 2)
    ctx.fill()
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.1)"
      ctx.beginPath()
      ctx.arc(tx - r * 0.25, ty - r * 0.25, r * 0.35, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const headR = enemy.size + (enemy.type === "boss" ? 5 : enemy.type === "miniBoss" ? 2 : 0)
  const head = ctx.createRadialGradient(-headR * 0.3, -headR * 0.3, 1, 0, 0, headR)
  head.addColorStop(0, enemy.hitFlash > 0.15 ? "#fff4dc" : tier.color)
  head.addColorStop(1, tier.colorDark)
  ctx.fillStyle = head
  ctx.beginPath()
  ctx.arc(0, 0, headR, 0, Math.PI * 2)
  ctx.fill()

  const eyeOffset = headR * 0.35
  for (const side of [-1, 1]) {
    ctx.fillStyle = "#f7edac"
    ctx.beginPath()
    ctx.arc(headR * 0.18, eyeOffset * side, 2.7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#1f1308"
    ctx.beginPath()
    ctx.arc(headR * 0.55, eyeOffset * side, 1.3, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.strokeStyle = enemy.type === "boss" ? "#ff5f5f" : "#d83d3d"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(headR - 2, 0)
  ctx.lineTo(headR + 9, 0)
  ctx.stroke()

  ctx.restore()
}

function saveHighscore(entry: HighscoreEntry) {
  if (typeof window === "undefined") return
  const existing = loadHighscores()
  const merged = [...existing, entry]
    .sort((a, b) => (b.score === a.score ? b.wave - a.wave : b.score - a.score))
    .slice(0, 12)
  window.localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(merged))
}

function loadHighscores(): HighscoreEntry[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(HIGHSCORE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as HighscoreEntry[]
    return Array.isArray(parsed)
      ? parsed.map((entry) => ({
          ...entry,
          wave: Number.isFinite(entry.wave) ? entry.wave : 0,
        }))
      : []
  } catch {
    return []
  }
}

function roomChannelName(code: string) {
  return `${ROOM_PREFIX}-${code.toLowerCase()}`
}

export default function SquirrelGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<GameState | null>(null)
  const keysRef = useRef<Record<string, boolean>>({})
  const rafRef = useRef<number>(0)
  const lastFrameRef = useRef(0)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const membersRef = useRef<RoomMember[]>([])
  const playerIdRef = useRef<string>(uid())
  const roomRoleRef = useRef<RoomRole>(null)
  const remoteInputsRef = useRef<Record<string, InputState>>({})
  const localTargetRef = useRef<Vec | null>(null)
  const scoreSavedRef = useRef(false)
  const lastStateBroadcastRef = useRef(0)
  const roadViewportRef = useRef<HTMLDivElement>(null)

  const [status, setStatus] = useState<Status>("menu")
  const [mode, setMode] = useState<PlayMode>("single")
  const [playerName, setPlayerName] = useState("Player")
  const [joinCode, setJoinCode] = useState("")
  const [roomCode, setRoomCode] = useState("")
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([])
  const [roomNotice, setRoomNotice] = useState("")
  const [highscores, setHighscores] = useState<HighscoreEntry[]>([])
  const [selectedLevel, setSelectedLevel] = useState(1)
  const [unlockedLevel, setUnlockedLevel] = useState(1)
  const [hud, setHud] = useState({
    hp: 100,
    score: 0,
    level: 1,
    levelName: LEVELS[0].name,
    environment: LEVELS[0].environment,
    wave: 0,
    waves: LEVELS[0].waves,
    wavePercent: 0,
    fusion: "Plain Paws",
    players: 1,
    mode: "single" as PlayMode,
    bossHp: 0,
    bossMaxHp: 0,
    eventName: "",
    eventColor: "",
    roomCode: "",
    pauseLabel: "",
    waveLabel: `Wave 0/${LEVELS[0].waves}`,
    nextHint: fusionHint({
      id: "",
      name: "",
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 0,
      hp: 0,
      maxHp: 0,
      score: 0,
      facing: { x: 1, y: 0 },
      fireStacks: 0,
      iceStacks: 0,
      seedStacks: 0,
      speedStacks: 0,
      shieldStacks: 0,
      attackCooldown: 0,
      specialCooldown: 0,
      hurtCooldown: 0,
      alive: true,
      hitFlash: 0,
      isHost: false,
      target: null,
    }),
    compass: fusionCompass({
      id: "",
      name: "",
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 0,
      hp: 0,
      maxHp: 0,
      score: 0,
      facing: { x: 1, y: 0 },
      fireStacks: 0,
      iceStacks: 0,
      seedStacks: 0,
      speedStacks: 0,
      shieldStacks: 0,
      attackCooldown: 0,
      specialCooldown: 0,
      hurtCooldown: 0,
      alive: true,
      hitFlash: 0,
      isHost: false,
      target: null,
    }),
  })

  const syncMembers = useCallback((members: RoomMember[]) => {
    membersRef.current = members
    setRoomMembers(members)
  }, [])

  const closeRoom = useCallback(() => {
    if (channelRef.current) {
      try {
        channelRef.current.postMessage({ type: "leave", memberId: playerIdRef.current } satisfies RoomMessage)
      } catch {}
      channelRef.current.close()
      channelRef.current = null
    }
    roomRoleRef.current = null
    remoteInputsRef.current = {}
    setRoomCode("")
    syncMembers([])
    setRoomNotice("")
  }, [syncMembers])

  const broadcastRoster = useCallback(() => {
    if (!channelRef.current || roomRoleRef.current !== "host") return
    channelRef.current.postMessage({ type: "roster", members: membersRef.current } satisfies RoomMessage)
  }, [])

  const updateHudFromState = useCallback(
    (state: GameState) => {
      const localPlayer =
        state.players.find((player) => player.id === playerIdRef.current) ??
        state.players.find((player) => player.isHost) ??
        state.players[0]
      const boss = state.enemies.find((enemy) => enemy.type === "boss" || enemy.type === "miniBoss" || enemy.type === "microBoss")
      const level = currentLevel(state)
      const wavePercent =
        state.waveSpawnTotal > 0 ? Math.min(100, Math.round((state.waveDefeated / state.waveSpawnTotal) * 100)) : state.wave > 0 ? 100 : 0
      setHud({
        hp: Math.round(localPlayer?.hp ?? 0),
        score: Math.round(localPlayer?.score ?? state.sharedScore ?? 0),
        level: level.level,
        levelName: level.name,
        environment: level.environment,
        wave: state.wave,
        waves: level.waves,
        wavePercent,
        fusion: localPlayer ? powerLabel(localPlayer) : "Plain Paws",
        players: state.players.filter((player) => player.alive).length,
        mode: state.mode,
        bossHp: boss ? Math.round(boss.hp) : 0,
        bossMaxHp: boss ? Math.round(boss.maxHp) : 0,
        eventName: state.activeEvent?.name ?? "",
        eventColor: state.activeEvent?.color ?? "",
        roomCode: state.roomCode ?? "",
        pauseLabel: state.levelPauseUntil > performance.now() ? "Next wave charging..." : "",
        waveLabel: state.mode === "endless" ? `Wave ${state.wave} Endless` : `Wave ${state.wave}/${level.waves}`,
        nextHint: localPlayer ? fusionHint(localPlayer) : "",
        compass: localPlayer
          ? fusionCompass(localPlayer)
          : fusionCompass({
              id: "",
              name: "",
              x: 0,
              y: 0,
              vx: 0,
              vy: 0,
              r: 0,
              hp: 0,
              maxHp: 0,
              score: 0,
              facing: { x: 1, y: 0 },
              fireStacks: 0,
              iceStacks: 0,
              seedStacks: 0,
              speedStacks: 0,
              shieldStacks: 0,
              attackCooldown: 0,
              specialCooldown: 0,
              hurtCooldown: 0,
              alive: true,
              hitFlash: 0,
              isHost: false,
              target: null,
            }),
      })
    },
    [],
  )

  const maybeSaveResult = useCallback(
    (result: "won" | "dead") => {
      const state = stateRef.current
      if (!state || scoreSavedRef.current) return
      const localPlayer =
        state.players.find((player) => player.id === playerIdRef.current) ??
        state.players.find((player) => player.isHost) ??
        state.players[0]
      if (!localPlayer) return
      scoreSavedRef.current = true
      saveHighscore({
        id: uid(),
        name: localPlayer.name,
        score: Math.round(localPlayer.score),
        level: currentLevel(state).level,
        mode: state.mode,
        result,
        wave: state.wave,
        date: new Date().toISOString(),
      })
      setHighscores(loadHighscores())
    },
    [],
  )

  const handleRoomMessage = useCallback(
    (message: RoomMessage) => {
      if (message.type === "join" && roomRoleRef.current === "host") {
        const existing = membersRef.current.some((member) => member.id === message.member.id)
        if (!existing && membersRef.current.length < MAX_PLAYERS) {
          const nextMembers = [...membersRef.current, message.member]
          syncMembers(nextMembers)
          broadcastRoster()
          setRoomNotice(`${message.member.name} joined`)
        }
        return
      }

      if (message.type === "roster" && roomRoleRef.current === "guest") {
        syncMembers(message.members)
        return
      }

      if (message.type === "leave") {
        const nextMembers = membersRef.current.filter((member) => member.id !== message.memberId)
        syncMembers(nextMembers)
        if (roomRoleRef.current === "host") broadcastRoster()
        return
      }

      if (message.type === "input" && roomRoleRef.current === "host") {
        remoteInputsRef.current[message.memberId] = message.input
        return
      }

      if (message.type === "start" && roomRoleRef.current === "guest") {
        stateRef.current = message.state
        scoreSavedRef.current = false
        setStatus("playing")
        updateHudFromState(message.state)
        return
      }

      if (message.type === "state" && roomRoleRef.current === "guest") {
        stateRef.current = message.state
        updateHudFromState(message.state)
        if (message.status === "won") {
          maybeSaveResult("won")
          setStatus("won")
        } else if (message.status === "dead") {
          maybeSaveResult("dead")
          setStatus("dead")
        } else {
          setStatus("playing")
        }
      }
    },
    [broadcastRoster, maybeSaveResult, syncMembers, updateHudFromState],
  )

  const openChannel = useCallback(
    (code: string, role: RoomRole) => {
      if (channelRef.current) channelRef.current.close()
      const channel = new BroadcastChannel(roomChannelName(code))
      channel.onmessage = (event: MessageEvent<RoomMessage>) => handleRoomMessage(event.data)
      channelRef.current = channel
      roomRoleRef.current = role
      setRoomCode(code)
    },
    [handleRoomMessage],
  )

  const launchSelectedLevel = useCallback((levelNumber = selectedLevel, runMode: PlayMode = "single") => {
    closeRoom()
    const members: RoomMember[] = [{ id: playerIdRef.current, name: playerName || "Player", isHost: true }]
    const state = makeGameState(runMode, members, null, levelNumber - 1)
    stateRef.current = state
    scoreSavedRef.current = false
    remoteInputsRef.current = {}
    setMode(runMode)
    setStatus("playing")
    updateHudFromState(state)
  }, [closeRoom, playerName, selectedLevel, updateHudFromState])

  const startSinglePlayer = useCallback(() => {
    setMode("single")
    setStatus("levelRoad")
  }, [])

  const startEndless = useCallback(() => {
    closeRoom()
    const members: RoomMember[] = [{ id: playerIdRef.current, name: playerName || "Player", isHost: true }]
    const state = makeGameState("endless", members, null, Math.max(0, selectedLevel - 1))
    state.banner = "Endless Run"
    state.bannerUntil = performance.now() + 2600
    stateRef.current = state
    scoreSavedRef.current = false
    remoteInputsRef.current = {}
    setMode("endless")
    setStatus("playing")
    updateHudFromState(state)
  }, [closeRoom, playerName, selectedLevel, updateHudFromState])

  const createRoom = useCallback(() => {
    const code = Math.random().toString(36).slice(2, 7).toUpperCase()
    const host: RoomMember = { id: playerIdRef.current, name: playerName || "Host", isHost: true }
    openChannel(code, "host")
    syncMembers([host])
    setMode("coop")
    setStatus("lobby")
    setRoomNotice("Room created. Share the code and press play as admin.")
  }, [openChannel, playerName, syncMembers])

  const joinRoom = useCallback(() => {
    const code = joinCode.trim().toUpperCase()
    if (!code) {
      setRoomNotice("Enter a room code first.")
      return
    }
    const guest: RoomMember = { id: playerIdRef.current, name: playerName || "Guest", isHost: false }
    openChannel(code, "guest")
    syncMembers([guest])
    setMode("coop")
    setStatus("lobby")
    channelRef.current?.postMessage({ type: "join", member: guest } satisfies RoomMessage)
    setRoomNotice("Joining room...")
  }, [joinCode, openChannel, playerName, syncMembers])

  const startRoomGame = useCallback(() => {
    if (roomRoleRef.current !== "host") return
    if (membersRef.current.length < 2) {
      setRoomNotice("You need 2 players in the room for co-op.")
      return
    }
    const state = makeGameState("coop", membersRef.current, roomCode)
    stateRef.current = state
    scoreSavedRef.current = false
    remoteInputsRef.current = {}
    channelRef.current?.postMessage({ type: "start", state } satisfies RoomMessage)
    updateHudFromState(state)
    setStatus("playing")
  }, [roomCode, updateHudFromState])

  useEffect(() => {
    setHighscores(loadHighscores())
    const unlocked = loadUnlockedLevel()
    setUnlockedLevel(unlocked)
    setSelectedLevel(unlocked)
    return () => closeRoom()
  }, [closeRoom])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      keysRef.current[event.key.toLowerCase()] = true
      if (event.key === "Escape") {
        if (status === "playing") setStatus("paused")
        else if (status === "paused") setStatus("playing")
      }
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(event.key.toLowerCase())) {
        localTargetRef.current = null
      }
    }
    const up = (event: KeyboardEvent) => {
      keysRef.current[event.key.toLowerCase()] = false
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [status])

  useEffect(() => {
    if (status !== "levelRoad") return
    const viewport = roadViewportRef.current
    if (!viewport) return
    const currentIndex = LEVELS.findIndex((level) => level.level === selectedLevel)
    if (currentIndex < 0) return
    const reversedIndex = LEVELS.length - 1 - currentIndex
    const targetTop = Math.max(0, reversedIndex * 170 - 40)
    viewport.scrollTo({ top: targetTop, behavior: "smooth" })
  }, [selectedLevel, status])

  const localInput = useCallback((): InputState => {
    const keys = keysRef.current
    return {
      up: !!(keys["w"] || keys["arrowup"]),
      down: !!(keys["s"] || keys["arrowdown"]),
      left: !!(keys["a"] || keys["arrowleft"]),
      right: !!(keys["d"] || keys["arrowright"]),
      target: localTargetRef.current,
    }
  }, [])

  const sendGuestInput = useCallback(() => {
    if (roomRoleRef.current !== "guest" || !channelRef.current || status !== "playing") return
    channelRef.current.postMessage({
      type: "input",
      memberId: playerIdRef.current,
      input: localInput(),
    } satisfies RoomMessage)
  }, [localInput, status])

  const setPointerTarget = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas || status !== "playing") return
    const rect = canvas.getBoundingClientRect()
    const target = {
      x: clamp(((clientX - rect.left) / rect.width) * WORLD.w, 0, WORLD.w),
      y: clamp(((clientY - rect.top) / rect.height) * WORLD.h, 0, WORLD.h),
    }
    localTargetRef.current = target

    const state = stateRef.current
    if (!state) return
    const localPlayer = state.players.find((player) => player.id === playerIdRef.current)
    if (localPlayer) localPlayer.target = target
  }, [status])

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    setPointerTarget(event.clientX, event.clientY)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.buttons === 1) setPointerTarget(event.clientX, event.clientY)
  }

  const simulate = useCallback(
    (state: GameState, dt: number, now: number) => {
      const level = currentLevel(state)

      if (state.activeEvent && now > state.eventUntil) {
        state.activeEvent = null
        state.nextEventAt = now + level.eventDelay
      }
      if (!state.activeEvent && now > state.nextEventAt) {
        state.activeEvent = choose(EVENTS)
        state.eventUntil = now + state.activeEvent.duration
        state.nextEventAt = state.eventUntil + level.eventDelay
        queueBanner(state, state.activeEvent.name, now)
      }

      if (state.levelPauseUntil > now) {
        const foodTarget = level.foodTarget + (state.activeEvent?.foodBonus ?? 0)
        while (state.foods.length < foodTarget) state.foods.push(spawnFood(state.levelIndex))
        return
      }

      if (state.pendingSpawns.length === 0 && state.enemies.length === 0) {
        if (state.wave === 0 || now >= state.nextWaveAt) {
          if (state.mode !== "endless" && state.wave >= level.waves) {
            if (state.levelIndex >= LEVELS.length - 1) {
              if (channelRef.current && roomRoleRef.current === "host") {
                channelRef.current.postMessage({ type: "state", state, status: "won" } satisfies RoomMessage)
              }
              setStatus("won")
              maybeSaveResult("won")
              return
            }
            const completedLevel = state.levelIndex + 1
            const nextUnlocked = Math.max(loadUnlockedLevel(), completedLevel + 1)
            saveUnlockedLevel(nextUnlocked)
            setUnlockedLevel(nextUnlocked)
            setSelectedLevel(Math.min(LEVELS.length, completedLevel + 1))
            setStatus("levelComplete")
            return
          } else {
            state.wave += 1
            state.endlessWaveBest = Math.max(state.endlessWaveBest, state.wave)
            if (state.mode === "endless") {
              const endlessStage = clamp(Math.floor((state.wave - 1) / 3), 0, LEVELS.length - 1)
              if (endlessStage !== state.levelIndex) {
                state.levelIndex = endlessStage
                const newLevel = currentLevel(state)
                state.nextEventAt = now + Math.max(4600, newLevel.eventDelay - state.wave * 45)
                queueBanner(state, `${newLevel.name} unlocked`, now)
              }
            }
            const currentWaveLevel = currentLevel(state)
            state.pendingSpawns = buildWave(currentWaveLevel, state.mode === "endless" ? ((state.wave - 1) % currentWaveLevel.waves) + 1 : state.wave)
            if (state.mode === "endless") {
              const extra = Math.floor(state.wave / 2)
              for (let i = 0; i < extra; i++) {
                state.pendingSpawns.push({
                  at: 0,
                  type: choose(currentWaveLevel.enemyPool),
                  tier: clamp(Math.floor((currentWaveLevel.level - 1) / 2) + Math.floor(state.wave / 4), 0, 4),
                })
              }
            }
            state.waveSpawnTotal = state.pendingSpawns.length
            state.waveDefeated = 0
            state.pendingSpawns.forEach((spawn) => {
              spawn.at = now + spawn.at
            })
            if (state.wave > 1) {
              const rewardFocus = state.players.find((player) => player.alive) ?? { x: WORLD.w / 2, y: WORLD.h / 2 }
              dropWaveReward(state, rewardFocus)
            }
            state.nextWaveAt = now + Math.max(1200, 2000 - state.wave * 18)
            queueBanner(state, state.mode === "endless" ? `Endless Wave ${state.wave}` : `Wave ${state.wave}/${currentWaveLevel.waves}`, now)
          }
        }
      }

      if (state.pendingSpawns.length > 0) {
        for (let i = state.pendingSpawns.length - 1; i >= 0; i--) {
          const spawn = state.pendingSpawns[i]
          if (now >= spawn.at) {
            state.enemies.push(createEnemy(spawn.type, spawn.tier))
            state.pendingSpawns.splice(i, 1)
          }
        }
      }

      const foodTarget = level.foodTarget + (state.activeEvent?.foodBonus ?? 0)
      while (state.foods.length < foodTarget) state.foods.push(spawnFood(state.levelIndex))

      for (const player of state.players) {
        if (!player.alive) continue
        const input =
          state.mode === "single" || player.id === playerIdRef.current
            ? localInput()
            : remoteInputsRef.current[player.id] ?? emptyInput()

        let ax = 0
        let ay = 0
        if (input.left) ax -= 1
        if (input.right) ax += 1
        if (input.up) ay -= 1
        if (input.down) ay += 1
        if (ax || ay) {
          player.target = null
          const direction = norm(ax, ay)
          const speedMul = (state.activeEvent?.playerSpeedMul ?? 1) * (1 + player.speedStacks * 0.15)
          player.vx += direction.x * 0.95 * speedMul * dt
          player.vy += direction.y * 0.95 * speedMul * dt
          player.facing = direction
        } else if (input.target ?? player.target) {
          player.target = input.target ?? player.target
          if (player.target) {
            const tdx = player.target.x - player.x
            const tdy = player.target.y - player.y
            const td = Math.hypot(tdx, tdy)
            if (td < 8) {
              player.target = null
              if (player.id === playerIdRef.current) localTargetRef.current = null
            } else {
              const direction = norm(tdx, tdy)
              const speedMul = (state.activeEvent?.playerSpeedMul ?? 1) * (1 + player.speedStacks * 0.15)
              player.vx += direction.x * 0.82 * speedMul * dt
              player.vy += direction.y * 0.82 * speedMul * dt
              player.facing = direction
            }
          }
        }

        const maxSpeed = 4.6 * (1 + player.speedStacks * 0.16) * (state.activeEvent?.playerSpeedMul ?? 1)
        player.vx *= 0.84
        player.vy *= 0.84
        const speed = Math.hypot(player.vx, player.vy)
        if (speed > maxSpeed) {
          player.vx = (player.vx / speed) * maxSpeed
          player.vy = (player.vy / speed) * maxSpeed
        }

        player.x = clamp(player.x + player.vx * dt, player.r, WORLD.w - player.r)
        player.y = clamp(player.y + player.vy * dt, player.r, WORLD.h - player.r)
        player.attackCooldown = Math.max(0, player.attackCooldown - dt * 16.6)
        player.specialCooldown = Math.max(0, player.specialCooldown - dt * 16.6)
        player.hurtCooldown = Math.max(0, player.hurtCooldown - dt * 16.6)
        player.hitFlash *= 0.88

        playerShoot(state, player, now)

        for (let i = state.foods.length - 1; i >= 0; i--) {
          const food = state.foods[i]
          if (Math.hypot(food.x - player.x, food.y - player.y) < player.r + 15) {
            const bonus = playerEatFood(player, food.type)
            player.score += 12
            state.sharedScore += 12
            addParticles(state, food.x, food.y, food.type.color, 10, 3)
            state.foods.splice(i, 1)
            if (bonus === "slowBurst") {
              for (const enemy of state.enemies) enemy.slowTimer = Math.max(enemy.slowTimer, 1200)
              queueBanner(state, "Frost pulse", now)
            } else if (bonus === "burnPulse") {
              for (const enemy of state.enemies) {
                if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < 180) enemy.hp -= 6
              }
              addParticles(state, player.x, player.y, "#ff7d4a", 18, 4)
              queueBanner(state, "Burn screen", now)
            } else if (bonus === "speedBurst") {
              player.vx *= 1.45
              player.vy *= 1.45
              player.speedStacks = clamp(player.speedStacks, 1, PLAYER_MAX_STACK)
              queueBanner(state, "Dash surge", now)
            } else if (bonus === "seedNova") {
              for (let burst = 0; burst < 8; burst++) {
                const angle = (Math.PI * 2 * burst) / 8
                state.projectiles.push({
                  id: nextId++,
                  owner: "player",
                  ownerId: player.id,
                  x: player.x,
                  y: player.y,
                  vx: Math.cos(angle) * 8.2,
                  vy: Math.sin(angle) * 8.2,
                  life: 900,
                  radius: 4,
                  color: "#e8c96f",
                  damage: 4,
                  kind: "seed",
                })
              }
              queueBanner(state, "Seed nova", now)
            }
          }
        }
      }

      for (const enemy of state.enemies) {
        enemy.reload -= dt * 16.6
        enemy.summonCooldown -= dt * 16.6
        enemy.dashCooldown -= dt * 16.6
        enemy.slowTimer = Math.max(0, enemy.slowTimer - dt * 16.6)
        enemy.hitFlash *= 0.86
        const target = nearestPlayer(enemy, state.players)
        if (!target) continue

        let move = norm(target.x - enemy.x, target.y - enemy.y)
        const distance = Math.hypot(target.x - enemy.x, target.y - enemy.y)
        enemy.wiggle += 0.22 * dt
        enemy.orbitSeed += 0.018 * dt

        if (enemy.type === "spitter") {
          if (distance < 160) move = norm(enemy.x - target.x, enemy.y - target.y)
          else if (distance < 240) move = { x: Math.cos(enemy.orbitSeed), y: Math.sin(enemy.orbitSeed) }
          if (enemy.reload <= 0) {
            enemyShoot(state, enemy, target)
            enemy.reload = ENEMY_ARCHETYPES.spitter.rangedCooldown - enemy.seedLevel * 120
          }
        } else if (enemy.type === "charger") {
          if (enemy.dashCooldown <= 0) {
            enemy.dash = 28
            enemy.dashCooldown = 2100
          }
        } else if (enemy.type === "orbiter") {
          const orbitTarget = {
            x: target.x + Math.cos(enemy.orbitSeed) * 140,
            y: target.y + Math.sin(enemy.orbitSeed) * 140,
          }
          move = norm(orbitTarget.x - enemy.x, orbitTarget.y - enemy.y)
          if (enemy.reload <= 0) {
            enemyShoot(state, enemy, target)
            enemy.reload = ENEMY_ARCHETYPES.orbiter.rangedCooldown - enemy.seedLevel * 100
          }
        } else if (enemy.type === "raptor") {
          const sweepTarget = {
            x: target.x + Math.cos(enemy.orbitSeed * 2.2) * 90,
            y: target.y + Math.sin(enemy.orbitSeed * 2.2) * 90,
          }
          move = norm(sweepTarget.x - enemy.x, sweepTarget.y - enemy.y)
          if (enemy.dashCooldown <= 0) {
            enemy.dash = 42
            enemy.dashCooldown = 1250
          }
        } else if (enemy.type === "dingo") {
          if (distance < 120) {
            move = norm(target.x - enemy.x, target.y - enemy.y)
          } else {
            move = norm(target.x + Math.sin(enemy.orbitSeed) * 35 - enemy.x, target.y - enemy.y)
          }
          if (enemy.dashCooldown <= 0) {
            enemy.dash = 18
            enemy.dashCooldown = 2400
          }
        } else if (enemy.type === "miniBoss") {
          if (enemy.reload <= 0) {
            enemyShoot(state, enemy, target)
            enemy.reload = 1100
          }
          if (enemy.dashCooldown <= 0) {
            enemy.dash = 34
            enemy.dashCooldown = 1700
          }
        } else if (enemy.type === "boss") {
          if (enemy.reload <= 0) {
            bossRadial(state, enemy)
            enemyShoot(state, enemy, target)
            enemy.reload = 900
          }
          if (enemy.summonCooldown <= 0) {
            enemy.summonCooldown = 5200
            state.enemies.push(createEnemy("miniBoss", clamp(enemy.tier - 1, 2, 4)))
            queueBanner(state, "Boss summoned a mini boss", now)
          }
        }

        const eventMul = state.activeEvent?.enemySpeedMul ?? 1
        const dashMul = enemy.dash > 0 ? 2.6 : 1
        const slowMul = enemy.slowTimer > 0 ? 0.52 : 1
        const speedMul = (1 + enemy.speedLevel * 0.12) * eventMul * slowMul
        const desiredHeading = Math.atan2(move.y, move.x)
        let diff = desiredHeading - enemy.heading
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        enemy.heading += diff * 0.12 * dt
        const drift =
          enemy.type === "slither" || enemy.type === "splitter" || enemy.type === "boss" || enemy.type === "miniBoss"
            ? Math.sin(enemy.wiggle) * 0.55
            : Math.sin(enemy.wiggle) * 0.22
        const moveAngle = enemy.heading + drift
        const stepX = Math.cos(moveAngle) * enemy.speed * speedMul * dashMul * dt
        const stepY = Math.sin(moveAngle) * enemy.speed * speedMul * dashMul * dt
        enemy.vx = stepX
        enemy.vy = stepY
        enemy.x += stepX
        enemy.y += stepY
        enemy.dash = Math.max(0, enemy.dash - dt * 16.6)

        for (let i = state.foods.length - 1; i >= 0; i--) {
          const food = state.foods[i]
          if (Math.hypot(food.x - enemy.x, food.y - enemy.y) < enemy.size + 10) {
            enemyEatFood(enemy, food.type)
            addParticles(state, food.x, food.y, food.type.color, 7, 2)
            state.foods.splice(i, 1)
          }
        }

        if (Math.hypot(target.x - enemy.x, target.y - enemy.y) < target.r + enemy.size && target.hurtCooldown <= 0) {
          target.hurtCooldown = 420
          target.hitFlash = 1
          if (target.shieldStacks > 0) target.shieldStacks -= 1
          else target.hp -= ENEMY_ARCHETYPES[enemy.type].contactDamage * (state.activeEvent?.enemyDamageMul ?? 1)
          addParticles(state, target.x, target.y, target.shieldStacks > 0 ? "#f0d58f" : "#ff6262", 12, 3)
        }
      }

      for (let i = state.projectiles.length - 1; i >= 0; i--) {
        const projectile = state.projectiles[i]
        projectile.x += projectile.vx * dt
        projectile.y += projectile.vy * dt
        projectile.life -= dt * 16.6

        if (projectile.owner === "player") {
          for (const enemy of state.enemies) {
            if (Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y) < projectile.radius + enemy.size) {
              enemy.hp -= projectile.damage
              enemy.hitFlash = 1
              if (projectile.kind === "ice") enemy.slowTimer = Math.max(enemy.slowTimer, 1400)
              if (projectile.kind === "obsidian") enemy.slowTimer = Math.max(enemy.slowTimer, 800)
              addParticles(state, projectile.x, projectile.y, projectile.color, 8, 3)
              projectile.life = projectile.kind === "obsidian" ? Math.min(projectile.life, 460) : -1
              break
            }
          }
        } else {
          for (const player of state.players) {
            if (!player.alive) continue
            if (Math.hypot(projectile.x - player.x, projectile.y - player.y) < projectile.radius + player.r) {
              if (player.hurtCooldown <= 0) {
                player.hurtCooldown = 380
                player.hitFlash = 1
                if (player.shieldStacks > 0) player.shieldStacks -= 1
                else player.hp -= projectile.damage
                addParticles(state, player.x, player.y, "#ff6262", 10, 3)
              }
              projectile.life = -1
              break
            }
          }
        }

        if (
          projectile.life <= 0 ||
          projectile.x < -80 ||
          projectile.x > WORLD.w + 80 ||
          projectile.y < -80 ||
          projectile.y > WORLD.h + 80
        ) {
          state.projectiles.splice(i, 1)
        }
      }

      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const enemy = state.enemies[i]
        if (enemy.hp > 0) continue
        addParticles(state, enemy.x, enemy.y, ENEMY_TIERS[enemy.tier].colorDark, 20, 4)
        const reward = ENEMY_TIERS[enemy.tier].reward + enemy.fireLevel * 4 + enemy.seedLevel * 4 + enemy.iceLevel * 4
        for (const player of state.players) {
          if (player.alive) player.score += reward
        }
        state.sharedScore += reward
        state.waveDefeated += 1

        if (enemy.type === "splitter" && enemy.tier > 0) {
          const childTier = clamp(enemy.tier - 1, 0, 4)
          state.enemies.push(createEnemy("slither", childTier))
          state.enemies.push(createEnemy("slither", childTier))
        }

        if (enemy.type === "boss") {
          queueBanner(state, "Viper King defeated", now)
        }

        state.enemies.splice(i, 1)
      }

      for (let i = state.players.length - 1; i >= 0; i--) {
        const player = state.players[i]
        if (player.alive && player.hp <= 0) {
          player.hp = 0
          player.alive = false
          addParticles(state, player.x, player.y, "#ff4545", 18, 4)
        }
      }

      if (state.players.every((player) => !player.alive)) {
        if (channelRef.current && roomRoleRef.current === "host") {
          channelRef.current.postMessage({ type: "state", state, status: "dead" } satisfies RoomMessage)
        }
        setStatus("dead")
        maybeSaveResult("dead")
        return
      }

      for (let i = state.particles.length - 1; i >= 0; i--) {
        const particle = state.particles[i]
        particle.x += particle.vx * dt
        particle.y += particle.vy * dt
        particle.vx *= 0.94
        particle.vy *= 0.94
        particle.life -= 0.03 * dt
        if (particle.life <= 0) state.particles.splice(i, 1)
      }
    },
    [localInput, maybeSaveResult],
  )

  const draw = useCallback((ctx: CanvasRenderingContext2D, state: GameState, now: number) => {
    const level = currentLevel(state)
    const bg = ctx.createLinearGradient(0, 0, 0, WORLD.h)
    bg.addColorStop(0, level.bgTop)
    bg.addColorStop(1, level.bgBottom)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, WORLD.w, WORLD.h)

    ctx.fillStyle = "rgba(255,255,255,0.05)"
    for (let i = 0; i < 36; i++) {
      const x = (i * 127 + now * 0.02) % (WORLD.w + 120) - 60
      const y = (i * 53) % WORLD.h
      ctx.beginPath()
      ctx.arc(x, y, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }

    if (level.decor === "garden") {
      ctx.fillStyle = "rgba(255,255,255,0.12)"
      ctx.fillRect(130, 140, 88, 58)
      ctx.fillStyle = "#c74343"
      ctx.fillRect(150, 126, 10, 12)
      ctx.fillRect(188, 126, 10, 12)
      ctx.fillStyle = "#f4d595"
      ctx.beginPath()
      ctx.arc(212, 148, 8, 0, Math.PI * 2)
      ctx.arc(228, 160, 7, 0, Math.PI * 2)
      ctx.fill()
    } else if (level.decor === "frost") {
      ctx.strokeStyle = "rgba(180,240,255,0.24)"
      for (let i = 0; i < 7; i++) {
        ctx.beginPath()
        ctx.moveTo(70 + i * 120, 90)
        ctx.lineTo(45 + i * 120, 125)
        ctx.lineTo(95 + i * 120, 125)
        ctx.closePath()
        ctx.stroke()
      }
    } else if (level.decor === "orchard") {
      ctx.fillStyle = "rgba(97,54,21,0.45)"
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(90 + i * 170, 110, 12, 64)
        ctx.beginPath()
        ctx.arc(96 + i * 170, 100, 28, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    for (const food of state.foods) {
      ctx.fillStyle = "rgba(0,0,0,0.2)"
      ctx.beginPath()
      ctx.ellipse(food.x, food.y + 13, 11, 4, 0, 0, Math.PI * 2)
      ctx.fill()
      const glow = ctx.createRadialGradient(food.x, food.y, 2, food.x, food.y, food.type.rare ? 26 : 20)
      glow.addColorStop(0, `${food.type.color}cc`)
      glow.addColorStop(1, `${food.type.color}00`)
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(food.x, food.y, food.type.rare ? 26 : 20, 0, Math.PI * 2)
      ctx.fill()
      if (food.type.rare) {
        ctx.strokeStyle = food.type.color
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(food.x, food.y, 18 + Math.sin(now / 150 + food.id) * 2, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.font = "26px serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(food.type.emoji, food.x, food.y)
    }

    const localPlayer = state.players.find((player) => player.id === playerIdRef.current)
    if (localPlayer?.target) {
      const pulse = 7 + Math.sin(now / 120) * 2
      ctx.strokeStyle = "rgba(255,255,255,0.55)"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(localPlayer.target.x, localPlayer.target.y, pulse, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(localPlayer.target.x - 9, localPlayer.target.y)
      ctx.lineTo(localPlayer.target.x + 9, localPlayer.target.y)
      ctx.moveTo(localPlayer.target.x, localPlayer.target.y - 9)
      ctx.lineTo(localPlayer.target.x, localPlayer.target.y + 9)
      ctx.stroke()
    }

    for (const projectile of state.projectiles) {
      const glow = ctx.createRadialGradient(projectile.x, projectile.y, 1, projectile.x, projectile.y, projectile.radius * 2)
      glow.addColorStop(0, `${projectile.color}ee`)
      glow.addColorStop(1, `${projectile.color}00`)
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(projectile.x, projectile.y, projectile.radius * 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = projectile.color
      ctx.beginPath()
      ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2)
      ctx.fill()
    }

    for (const enemy of state.enemies) {
      const tier = ENEMY_TIERS[enemy.tier]
      drawSnake(ctx, enemy, now)

      const barW = enemy.type === "boss" ? 88 : enemy.type === "miniBoss" ? 64 : 36
      const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1)
      ctx.fillStyle = "rgba(0,0,0,0.45)"
      ctx.fillRect(enemy.x - barW / 2 - 1, enemy.y - enemy.size - 18, barW + 2, 7)
      ctx.fillStyle = enemy.type === "boss" ? "#ff6b6b" : enemy.type === "miniBoss" ? "#ffae52" : "#7fe07f"
      ctx.fillRect(enemy.x - barW / 2, enemy.y - enemy.size - 17, barW * ratio, 5)
    }

    for (const player of state.players) {
      if (!player.alive) continue
      const fusionColor = playerColor(player)
      ctx.fillStyle = "rgba(0,0,0,0.24)"
      ctx.beginPath()
      ctx.ellipse(player.x, player.y + player.r + 2, player.r * 0.9, 5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#fff"
      ctx.font = "bold 11px ui-sans-serif"
      ctx.textAlign = "center"
      ctx.fillText(player.name.slice(0, 8), player.x, player.y - 24)
      ctx.save()
      ctx.translate(player.x, player.y)
      const facingAngle = Math.atan2(player.facing.y, player.facing.x)
      ctx.rotate(facingAngle)

      ctx.save()
      ctx.translate(-player.r - 4, 0)
      ctx.rotate(Math.sin(now / 180 + player.x * 0.02) * 0.28)
      const tailGradient = ctx.createLinearGradient(-18, 0, 8, 0)
      tailGradient.addColorStop(0, "#8a5526")
      tailGradient.addColorStop(1, "#b97837")
      ctx.fillStyle = tailGradient
      ctx.beginPath()
      ctx.ellipse(-7, 0, 14, 9, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      if (dominantPower(player) !== "none") {
        ctx.strokeStyle = fusionColor
        ctx.lineWidth = 3
        ctx.globalAlpha = 0.7 + Math.sin(now / 140) * 0.18
        ctx.beginPath()
        ctx.arc(0, 0, player.r + 5, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      const bodyGradient = ctx.createRadialGradient(-4, -4, 2, 0, 0, player.r)
      bodyGradient.addColorStop(0, player.hitFlash > 0.1 ? "#fff1cf" : "#cf8a3f")
      bodyGradient.addColorStop(1, "#a8631f")
      ctx.fillStyle = bodyGradient
      ctx.beginPath()
      ctx.arc(0, 0, player.r, 0, Math.PI * 2)
      ctx.fill()
      if (dominantPower(player) !== "none") {
        ctx.fillStyle = fusionColor
        ctx.globalAlpha = 0.28
        ctx.beginPath()
        ctx.arc(0, 0, player.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
      ctx.fillStyle = "#f1d399"
      ctx.beginPath()
      ctx.ellipse(3, 2, 8, 10, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#1e140d"
      ctx.beginPath()
      ctx.arc(8, -4, 2.5, 0, Math.PI * 2)
      ctx.arc(8, 4, 2.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      for (let i = 0; i < player.shieldStacks; i++) {
        ctx.strokeStyle = "#f0d58f"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(player.x, player.y, player.r + 8 + i * 5 + Math.sin(now / 170 + i) * 1.5, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    for (const particle of state.particles) {
      ctx.globalAlpha = particle.life / particle.maxLife
      ctx.fillStyle = particle.color
      ctx.beginPath()
      ctx.arc(particle.x, particle.y, particle.size * particle.life, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    if (state.banner && now < state.bannerUntil) {
      ctx.fillStyle = "rgba(0,0,0,0.45)"
      ctx.fillRect(WORLD.w / 2 - 180, 18, 360, 42)
      ctx.fillStyle = level.accent
      ctx.font = "bold 20px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText(state.banner, WORLD.w / 2, 45)
    }
  }, [])

  useEffect(() => {
    if (status !== "playing" && status !== "dead" && status !== "won") return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const frame = (time: number) => {
      const dt = Math.min(33, time - (lastFrameRef.current || time)) / 16.6667
      lastFrameRef.current = time
      const state = stateRef.current

      if (state) {
        const hostDriven = state.mode !== "coop" || roomRoleRef.current === "host"
        if (hostDriven && status === "playing") {
          simulate(state, dt, time)
          if (channelRef.current && roomRoleRef.current === "host" && time - lastStateBroadcastRef.current > 60) {
            lastStateBroadcastRef.current = time
            channelRef.current.postMessage({ type: "state", state, status } satisfies RoomMessage)
          }
        } else if (state.mode === "coop" && roomRoleRef.current === "guest" && status === "playing") {
          sendGuestInput()
        }

        draw(ctx, state, time)
        updateHudFromState(state)
      } else {
        ctx.clearRect(0, 0, WORLD.w, WORLD.h)
      }

      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, sendGuestInput, simulate, status, updateHudFromState])

  const backToMenu = useCallback(() => {
    stateRef.current = null
    setStatus("menu")
    setRoomNotice("")
    remoteInputsRef.current = {}
    scoreSavedRef.current = false
    closeRoom()
  }, [closeRoom])

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="relative w-full max-w-[960px] overflow-hidden rounded-[28px] border border-white/10 bg-[#16120f] shadow-2xl">
        <canvas
          ref={canvasRef}
          width={WORLD.w}
          height={WORLD.h}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          className="block w-full bg-[#2f512b]"
          style={{ aspectRatio: `${WORLD.w}/${WORLD.h}` }}
        />

        {status === "playing" && (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4 text-white">
              <div className="flex flex-col items-center gap-1">
              <div className="rounded-full bg-black/45 px-4 py-2 text-sm font-bold text-white backdrop-blur-sm">
                {hud.mode === "endless" ? `Endless - ${hud.levelName}` : `Level ${hud.level} - ${hud.levelName}`}
              </div>
              <div className="rounded-full bg-black/45 px-4 py-1 text-xs text-white/85 backdrop-blur-sm">
                {hud.waveLabel} - {hud.wavePercent}%
              </div>
              <div className="h-2.5 w-40 overflow-hidden rounded-full bg-black/35">
                <div
                  className="h-full rounded-full bg-[#9dde6d] transition-[width] duration-200"
                  style={{ width: `${hud.wavePercent}%` }}
                />
              </div>
              {hud.pauseLabel && <div className="rounded-full bg-[#ffd966]/15 px-4 py-1 text-xs text-[#ffd966]">{hud.pauseLabel}</div>}
              {hud.eventName && (
                <div
                  className="rounded-full px-4 py-1 text-xs font-bold backdrop-blur-sm"
                  style={{ background: "rgba(0,0,0,0.55)", color: hud.eventColor }}
                >
                  {hud.eventName}
                </div>
              )}
            </div>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 text-white">
              <div className="mx-auto grid max-w-[920px] gap-3 md:grid-cols-[1.05fr_1.2fr_0.85fr]">
                <div className="rounded-[24px] border border-white/10 bg-black/50 px-4 py-3 backdrop-blur-md">
                  <div className="mb-1 flex items-center gap-2 text-sm font-bold">
                    <span>HP</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/20">
                      <div className="h-full rounded-full bg-[#68dd68]" style={{ width: `${hud.hp}%` }} />
                    </div>
                    <span className="font-mono text-xs">{hud.hp}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono text-white/85">
                    <span>Score {hud.score}</span>
                    <span>{hud.fusion}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-white/60">{hud.environment}</div>
                  <div className="mt-1 line-clamp-2 text-[11px] text-white/70">{hud.nextHint}</div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,12,10,0.86),rgba(8,8,10,0.82))] px-4 py-3 backdrop-blur-md">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/55">Weapon Route</div>
                    <div className="rounded-full bg-white/8 px-2 py-1 text-[10px] uppercase tracking-wide text-[#eccd8d]">Guard passive</div>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
                    {hud.compass.branches.map((branch, index) => (
                      <React.Fragment key={`${branch.label}-${index}`}>
                        {index > 0 && <div className="text-center text-xs text-white/35">{index === 1 ? "^" : "->"}</div>}
                        <div className="flex min-w-0 flex-col items-center text-center">
                          <div
                            className="flex h-9 w-9 items-center justify-center rounded-2xl border text-sm font-black"
                            style={{ borderColor: `${branch.color}aa`, background: `${branch.color}22`, color: branch.color }}
                          >
                            {branch.icon}
                          </div>
                          <div className="mt-1 text-[11px] font-bold text-white">{branch.label}</div>
                          <div className="text-[10px] leading-tight text-white/55">{branch.outcome}</div>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-2 rounded-2xl bg-white/6 px-3 py-2">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-black"
                      style={{ background: `${hud.compass.center.color}26`, color: hud.compass.center.color }}
                    >
                      {hud.compass.center.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-white">{hud.compass.center.label}</div>
                      <div className="text-[10px] text-white/55">{hud.compass.center.outcome}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-black/50 px-4 py-3 text-right text-xs text-white backdrop-blur-md">
                  <div>Players alive: {hud.players}</div>
                  {hud.roomCode && <div>Room {hud.roomCode}</div>}
                  <div className="mt-1 text-white/60">{hud.mode === "endless" ? "Heavy endless pressure" : "Campaign run"}</div>
                  {hud.bossMaxHp > 0 && (
                    <>
                      <div className="mt-2 font-bold text-[#ff8a8a]">Boss HP</div>
                      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-white/15">
                        <div
                          className="h-full rounded-full bg-[#ff5f5f]"
                          style={{ width: `${(hud.bossHp / hud.bossMaxHp) * 100}%` }}
                        />
                      </div>
                      <div className="mt-1 font-mono">
                        {hud.bossHp}/{hud.bossMaxHp}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {status === "menu" && (
          <div className="absolute inset-0 flex flex-col justify-between bg-[radial-gradient(circle_at_top,#64412a,transparent_42%),radial-gradient(circle_at_bottom_left,rgba(120,180,255,0.14),transparent_28%),linear-gradient(180deg,rgba(17,12,9,0.92),rgba(5,5,5,0.98))] p-6 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-4xl font-black tracking-tight md:text-5xl">Squirrel Fusion</h1>
                <p className="mt-2 max-w-xl text-sm text-white/75 md:text-base">
                  Campanie cu drum vertical, fusion routes mai clare, pradatori noi si un Endless greu care urca prin toate
                  biome-urile.
                </p>
              </div>
              <div className="min-w-[250px] rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
                <div className="mb-2 text-sm font-bold uppercase tracking-wide text-[#ffcb8a]">Highscores</div>
                <div className="space-y-2 text-xs">
                  {highscores.length === 0 && <div className="text-white/55">No runs yet.</div>}
                  {highscores.map((entry, index) => (
                    <div key={entry.id} className="flex items-center justify-between gap-3 rounded-2xl bg-black/20 px-3 py-2">
                      <span className="leading-tight">
                        {index + 1}. {entry.name}
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-white/40">{entry.mode}</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-mono text-[#ffd966]">{entry.score}</span>
                        <span className="block text-[10px] text-white/45">W{entry.wave}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-[1.3fr_1fr]">
              <div className="rounded-[24px] border border-white/10 bg-black/30 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.24)] backdrop-blur-sm">
                <div className="mb-4 flex gap-2 text-sm font-semibold">
                  <button
                    onClick={() => setMode("single")}
                    className={`rounded-full px-4 py-2 ${mode === "single" ? "bg-[#ff8f57] text-black" : "bg-white/10 text-white"}`}
                  >
                    Single Player
                  </button>
                  <button
                    onClick={() => setMode("endless")}
                    className={`rounded-full px-4 py-2 ${mode === "endless" ? "bg-[#ffd966] text-black" : "bg-white/10 text-white"}`}
                  >
                    Endless
                  </button>
                  <button
                    onClick={() => setMode("coop")}
                    className={`rounded-full px-4 py-2 ${mode === "coop" ? "bg-[#7fd6ff] text-black" : "bg-white/10 text-white"}`}
                  >
                    Multiplayer Co-op
                  </button>
                </div>

                <label className="mb-3 block text-sm text-white/70">
                  Nickname
                  <input
                    value={playerName}
                    onChange={(event) => setPlayerName(event.target.value)}
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
                    placeholder="Player name"
                  />
                </label>

                {mode === "single" ? (
                  <div className="space-y-3">
                    <button
                      onClick={startSinglePlayer}
                      className="w-full rounded-2xl bg-[#ff8f57] px-5 py-4 text-left font-bold text-black transition hover:scale-[1.01]"
                    >
                      Play Campaign
                    </button>
                    <p className="text-sm text-white/65">
                      Intri in Level Road, alegi un nivel deblocat si vezi briefing-ul inainte sa inceapa run-ul.
                    </p>
                  </div>
                ) : mode === "endless" ? (
                  <div className="space-y-3">
                    <button
                      onClick={startEndless}
                      className="w-full rounded-2xl bg-[#ffd966] px-5 py-4 text-left font-bold text-black transition hover:scale-[1.01]"
                    >
                      Start Endless
                    </button>
                    <p className="text-sm text-white/65">
                      Wave dupa wave, biome-urile avanseaza din 3 in 3 valuri, iar highscores tin scorul si wave-ul maxim.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 text-sm font-bold text-[#ffcb8a]">Create Room</div>
                      <p className="mb-3 text-xs text-white/60">Adminul creeaza room-ul si da Play cand intra al doilea jucator.</p>
                      <button onClick={createRoom} className="w-full rounded-2xl bg-[#ff8f57] px-4 py-3 font-bold text-black">
                        Create Room
                      </button>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 text-sm font-bold text-[#7fd6ff]">Join Room</div>
                      <input
                        value={joinCode}
                        onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                        className="mb-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
                        placeholder="Room code"
                      />
                      <button onClick={joinRoom} className="w-full rounded-2xl bg-[#7fd6ff] px-4 py-3 font-bold text-black">
                        Join
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-[24px] border border-white/10 bg-black/25 p-5 text-sm text-white/75 shadow-[0_18px_60px_rgba(0,0,0,0.24)] backdrop-blur-sm">
                <div className="mb-3 text-sm font-bold uppercase tracking-wide text-[#9dde6d]">Fresh Systems</div>
                <ul className="space-y-2">
                  <li>Fusion route panel in-match, cu nodul curent in centru si 3 directii de upgrade.</li>
                  <li>Campania urca pe un drum vertical inversat corect: sus e progres nou, jos e replay.</li>
                  <li>Endless muta automat run-ul prin biome-uri si tine highscore cu score si wave.</li>
                  <li>Fire, Ice, Seed si Speed au identitate mai clara, iar Guard ramane pasiv si sigur.</li>
                  <li>UI-ul are contraste mai bune, carduri mai curate si mai putina aglomeratie pe ecran.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {status === "levelSelect" && (
          <div className="absolute inset-0 flex flex-col justify-between bg-[linear-gradient(180deg,rgba(16,12,10,0.94),rgba(7,7,8,0.98))] p-6 text-white">
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-white/45">Single Player</div>
              <h2 className="mt-2 text-4xl font-black">Choose Level</h2>
              <p className="mt-2 max-w-2xl text-sm text-white/70">
                Nivelele se deblocheaza pe rand. Alege un nivel deblocat si apoi intra in briefing.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {LEVELS.map((level) => {
                const locked = level.level > unlockedLevel
                return (
                  <button
                    key={level.level}
                    onClick={() => !locked && setSelectedLevel(level.level)}
                    className={`rounded-[24px] border p-4 text-left transition ${selectedLevel === level.level ? "border-[#ff8f57] bg-[#ff8f57]/15" : "border-white/10 bg-white/5"} ${locked ? "opacity-45" : "hover:scale-[1.01]"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold">
                        {locked ? "🔒 " : ""}
                        {level.level}. {level.name}
                      </div>
                      <div className="text-xs font-mono text-white/60">{level.waves} waves</div>
                    </div>
                    <div className="mt-2 text-xs text-white/65">{level.environment}</div>
                    <div className="mt-1 text-xs text-white/55">{level.tagline}</div>
                  </button>
                )
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStatus("briefing")}
                disabled={selectedLevel > unlockedLevel}
                className="rounded-2xl bg-[#ff8f57] px-5 py-3 font-bold text-black disabled:opacity-50"
              >
                Continue
              </button>
              <button onClick={backToMenu} className="rounded-2xl bg-white/10 px-5 py-3 font-bold text-white">
                Menu
              </button>
            </div>
          </div>
        )}

        {status === "levelRoad" && (
          <div className="absolute inset-0 flex flex-col bg-[radial-gradient(circle_at_top,rgba(255,143,87,0.12),transparent_20%),linear-gradient(180deg,rgba(16,12,10,0.94),rgba(7,7,8,0.98))] p-6 text-white">
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-white/45">Single Player</div>
              <h2 className="mt-2 text-4xl font-black">Level Road</h2>
              <p className="mt-2 max-w-2xl text-sm text-white/70">
                Sus e progresul nou. Daca faci scroll in jos cobori spre nivelurile vechi pe care le poti rejuca.
              </p>
            </div>

            <div ref={roadViewportRef} className="no-scrollbar mt-5 flex-1 overflow-y-auto rounded-[28px] border border-white/10 bg-black/20 p-4">
              <div className="relative mx-auto max-w-[760px] pb-8 pt-4">
                <div className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 rounded-full bg-gradient-to-b from-[#ff8f57] via-[#ffd966] to-[#7fd6ff]" />
                {[...LEVELS].reverse().map((level, visualIndex) => {
                  const locked = level.level > unlockedLevel
                  const rightSide = visualIndex % 2 === 0
                  return (
                    <div key={level.level} className={`relative mb-7 flex ${rightSide ? "justify-end" : "justify-start"}`}>
                      <div className={`pointer-events-none absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-[#16120f] ${locked ? "bg-white/25" : "bg-[#ff8f57]"}`} />
                      <button
                        onClick={() => !locked && setSelectedLevel(level.level)}
                        className={`w-full min-w-[280px] rounded-[24px] border p-4 text-left transition ${selectedLevel === level.level ? "border-[#ff8f57] bg-[#ff8f57]/15 shadow-[0_0_0_1px_rgba(255,143,87,0.3)]" : "border-white/10 bg-white/5"} ${locked ? "opacity-45" : "hover:scale-[1.01] hover:bg-white/[0.07]"}`}
                        style={{ maxWidth: ROAD_CARD_WIDTH }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-bold">
                            {locked ? "Locked " : ""}
                            {level.level}. {level.name}
                          </div>
                          <div className="text-xs font-mono text-white/60">{level.waves} waves</div>
                        </div>
                        <div className="mt-2 text-xs text-white/65">{level.environment}</div>
                        <div className="mt-1 text-xs text-white/55">{level.tagline}</div>
                        {!locked && (
                          <div className="mt-3 text-[11px] uppercase tracking-wide text-[#ffd966]">
                            {level.level === unlockedLevel ? "Current frontier" : level.level < unlockedLevel ? "Replay available" : "Unlocked next"}
                          </div>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setStatus("briefing")}
                disabled={selectedLevel > unlockedLevel}
                className="rounded-2xl bg-[#ff8f57] px-5 py-3 font-bold text-black disabled:opacity-50"
              >
                Continue
              </button>
              <button onClick={backToMenu} className="rounded-2xl bg-white/10 px-5 py-3 font-bold text-white">
                Menu
              </button>
            </div>
          </div>
        )}

        {status === "briefing" && (
          <div className="absolute inset-0 flex flex-col justify-between bg-[linear-gradient(180deg,rgba(12,14,16,0.92),rgba(6,7,9,0.96))] p-6 text-white">
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-white/45">Level Briefing</div>
              <h2 className="mt-2 text-4xl font-black">
                {selectedLevel}. {LEVELS[selectedLevel - 1].name}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-white/70">
                {LEVELS[selectedLevel - 1].environment}: {LEVELS[selectedLevel - 1].tagline}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                <div className="mb-3 text-sm font-bold uppercase tracking-wide text-[#ffcb8a]">Level Roadmap</div>
                <div className="space-y-2 text-sm text-white/75">
                  <div>{LEVELS[selectedLevel - 1].waves} waves in this level.</div>
                  <div>Environment predators: {LEVELS[selectedLevel - 1].enemyPool.join(", ")}.</div>
                  <div>Special trigger: micro/mini/boss appears based on level milestone.</div>
                  <div>Tip: commit to one fusion path, then use off-path items for mini powers.</div>
                </div>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                <div className="mb-3 text-sm font-bold uppercase tracking-wide text-[#7fd6ff]">Fusion Intel</div>
                <div className="grid gap-2">
                  {EVOLUTION_PATHS.map((path) => (
                    <div key={path.id} className="rounded-2xl bg-black/20 px-3 py-2 text-xs text-white/80">
                      <span className="font-bold">{path.name}</span>: {path.steps.join(" -> ")}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => launchSelectedLevel()} className="rounded-2xl bg-[#ff8f57] px-5 py-3 font-bold text-black">
                Start Run
              </button>
              <button onClick={backToMenu} className="rounded-2xl bg-white/10 px-5 py-3 font-bold text-white">
                Menu
              </button>
            </div>
          </div>
        )}

        {status === "lobby" && (
          <div className="absolute inset-0 flex flex-col justify-between bg-[linear-gradient(180deg,rgba(10,12,18,0.92),rgba(5,7,9,0.96))] p-6 text-white">
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-white/45">Lobby</div>
              <h2 className="mt-2 text-4xl font-black">{roomCode}</h2>
              <p className="mt-2 max-w-lg text-sm text-white/70">
                Co-op local in browser tabs. Host-ul incepe jocul cand amandoi jucatorii sunt in room.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-[1fr_280px]">
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                <div className="mb-3 text-sm font-bold text-[#ffcb8a]">Players</div>
                <div className="space-y-3">
                  {roomMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between rounded-2xl bg-black/25 px-4 py-3">
                      <span>{member.name}</span>
                      <span className="text-xs uppercase tracking-wide text-white/55">{member.isHost ? "Admin" : "Guest"}</span>
                    </div>
                  ))}
                </div>
                {roomNotice && <div className="mt-3 text-xs text-white/55">{roomNotice}</div>}
              </div>

              <div className="flex flex-col justify-between rounded-[24px] border border-white/10 bg-white/5 p-5">
                <div>
                  <div className="text-sm font-bold">{roomRoleRef.current === "host" ? "Admin Controls" : "Waiting for admin"}</div>
                  <p className="mt-2 text-sm text-white/65">
                    {roomRoleRef.current === "host"
                      ? "Press Play when both players are connected."
                      : "Adminul room-ului trebuie sa porneasca meciul."}
                  </p>
                </div>
                <div className="mt-4 flex flex-col gap-3">
                  {roomRoleRef.current === "host" && (
                    <button onClick={startRoomGame} className="rounded-2xl bg-[#ff8f57] px-4 py-3 font-bold text-black">
                      Play
                    </button>
                  )}
                  <button onClick={backToMenu} className="rounded-2xl bg-white/10 px-4 py-3 font-bold text-white">
                    Back
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {status === "paused" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 p-6 text-center text-white backdrop-blur-sm">
            <h2 className="text-4xl font-black">Paused</h2>
            <p className="text-sm text-white/70">`Esc` resumes. You can also restart or go back to menu.</p>
            <div className="flex gap-3">
              <button onClick={() => setStatus("playing")} className="rounded-2xl bg-[#ff8f57] px-5 py-3 font-bold text-black">
                Resume
              </button>
              <button
                onClick={() => (hud.mode === "endless" ? startEndless() : launchSelectedLevel(hud.level))}
                className="rounded-2xl bg-white/10 px-5 py-3 font-bold text-white"
              >
                Restart
              </button>
              <button onClick={backToMenu} className="rounded-2xl bg-white/10 px-5 py-3 font-bold text-white">
                Menu
              </button>
            </div>
          </div>
        )}

        {status === "levelComplete" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 p-6 text-center text-white backdrop-blur-sm">
            <h2 className="text-4xl font-black text-[#ffd966]">Level Clear</h2>
            <p className="max-w-md text-sm text-white/75">
              Ai terminat nivelul {hud.level}. Urmatorul nivel este acum deblocat si are un environment mai nebun.
            </p>
            <div className="rounded-2xl bg-white/10 px-5 py-3 font-mono">Score {hud.score}</div>
            <div className="flex gap-3">
              <button onClick={backToMenu} className="rounded-2xl bg-white/10 px-5 py-3 font-bold text-white">
                Menu
              </button>
              <button
                onClick={() => (hud.mode === "endless" ? startEndless() : launchSelectedLevel(hud.level))}
                className="rounded-2xl bg-white/10 px-5 py-3 font-bold text-white"
              >
                Restart
              </button>
              <button
                onClick={() => {
                  const nextLevel = Math.min(LEVELS.length, hud.level + 1)
                  setSelectedLevel(nextLevel)
                  setStatus("briefing")
                }}
                className="rounded-2xl bg-[#ff8f57] px-5 py-3 font-bold text-black"
              >
                Next Level
              </button>
            </div>
          </div>
        )}

        {(status === "dead" || status === "won") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 p-6 text-center text-white backdrop-blur-sm">
            <h2 className={`text-5xl font-black ${status === "won" ? "text-[#ffd966]" : "text-[#ff6b6b]"}`}>
              {status === "won" ? "Victory" : "Game Over"}
            </h2>
            <p className="max-w-md text-sm text-white/75">
              {status === "won"
                ? "Ai terminat toate cele 10 niveluri, mini-boss-ul de la 5 si boss-ul final care spawneaza adds."
                : "Wave-urile te-au prins. Incearca alta combinatie de fusion si tine linia pana la boss."}
            </p>
            <div className="rounded-2xl bg-white/10 px-5 py-3 font-mono">Score {hud.score}</div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (mode === "single") launchSelectedLevel(hud.level)
                  else if (mode === "endless") startEndless()
                  else backToMenu()
                }}
                className="rounded-2xl bg-[#ff8f57] px-5 py-3 font-bold text-black"
              >
                {mode === "single" ? "Play Again" : mode === "endless" ? "Run Again" : "Back to Lobby"}
              </button>
              <button onClick={backToMenu} className="rounded-2xl bg-white/10 px-5 py-3 font-bold text-white">
                Menu
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid w-full max-w-[960px] gap-3 md:grid-cols-[1.2fr_1fr]">
        <div className="rounded-[24px] border border-border bg-card p-4">
          <div className="mb-3 text-sm font-bold uppercase tracking-wide text-card-foreground">Fusion Food</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {FOODS.map((food) => (
              <div key={food.id} className="rounded-2xl border border-border bg-background/60 p-3">
                <div className="text-2xl">{food.emoji}</div>
                <div className="mt-2 text-sm font-bold">
                  {food.powerName} {food.rare && <span className="text-[10px] uppercase text-sky-500">Rare</span>}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{food.description}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-border bg-card p-4">
          <div className="mb-3 text-sm font-bold uppercase tracking-wide text-card-foreground">Controls</div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div>`WASD` or arrow keys to move.</div>
            <div>Click to move and drag to re-route.</div>
            <div>Attacks fire automatically based on your strongest fusion.</div>
            <div>In co-op, the room works across browser tabs with the same code.</div>
          </div>
        </div>
      </div>

      <div className="grid w-full max-w-[960px] gap-3 md:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[24px] border border-border bg-card p-4">
          <div className="mb-3 text-sm font-bold uppercase tracking-wide text-card-foreground">Evolution Roadmap</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {EVOLUTION_PATHS.map((path) => (
              <div key={path.id} className="rounded-2xl border border-border bg-background/60 p-3">
                <div className="text-sm font-bold">{path.name}</div>
                <div className="mt-2 text-xs text-muted-foreground">{path.steps.join(" -> ")}</div>
                <div className="mt-2 text-xs text-card-foreground/80">{path.combo}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-border bg-card p-4">
          <div className="mb-3 text-sm font-bold uppercase tracking-wide text-card-foreground">Level Roadmap</div>
          <div className="space-y-2">
            {LEVELS.map((level) => (
              <div key={level.level} className="rounded-2xl border border-border bg-background/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-bold">
                    {level.level}. {level.name}
                  </div>
                  <div className="text-xs font-mono text-muted-foreground">{level.waves} waves</div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {level.environment}: {level.tagline}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
