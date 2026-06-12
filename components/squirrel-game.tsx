"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  ENEMY_ARCHETYPES,
  ENEMY_TIERS,
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

type Status = "menu" | "lobby" | "playing" | "dead" | "won"
type PlayMode = "single" | "coop"
type RoomRole = "host" | "guest" | null

interface Vec {
  x: number
  y: number
}

interface InputState {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
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
  kind: "seed" | "fire" | "spark" | "venom"
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
  seedStacks: number
  speedStacks: number
  shieldStacks: number
  attackCooldown: number
  specialCooldown: number
  hurtCooldown: number
  alive: boolean
  hitFlash: number
  isHost: boolean
}

interface EnemyState extends Vec {
  id: string
  type: EnemyType
  tier: number
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
  seedLevel: number
  speedLevel: number
  hitFlash: number
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
  pendingSpawns: SpawnOrder[]
  nextWaveAt: number
  sharedScore: number
  activeEvent: GameEvent | null
  eventUntil: number
  nextEventAt: number
  banner: string
  bannerUntil: number
  mode: PlayMode
  roomCode: string | null
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
  date: string
}

type RoomMessage =
  | { type: "join"; member: RoomMember }
  | { type: "roster"; members: RoomMember[] }
  | { type: "leave"; memberId: string }
  | { type: "input"; memberId: string; input: InputState }
  | { type: "start"; state: GameState }
  | { type: "state"; state: GameState; status: Status }

const emptyInput = (): InputState => ({ up: false, down: false, left: false, right: false })

let nextId = 1
const uid = () => `${Date.now()}-${nextId++}`

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

function dominantPower(player: PlayerState): PowerId {
  const entries: [PowerId, number][] = [
    ["fire", player.fireStacks],
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
      : power === "seeds"
        ? player.seedStacks
        : power === "speed"
          ? player.speedStacks
          : power === "shield"
            ? player.shieldStacks
            : 0
  if (power === "none") return "Plain Paws"
  if (power === "fire") return ["Spark", "Flame", "Inferno"][stacks - 1] ?? "Inferno"
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
  if (power === "seeds") return ["#b17a3f", "#c89a41", "#e1c64d"][player.seedStacks - 1] ?? "#e1c64d"
  if (power === "speed") return ["#5f8dff", "#3f7dff", "#6bc9ff"][player.speedStacks - 1] ?? "#6bc9ff"
  if (power === "shield") return ["#b18d56", "#d5b06c", "#f0d58f"][player.shieldStacks - 1] ?? "#f0d58f"
  return "#b97837"
}

function spawnFood(): FoodItem {
  return {
    id: nextId++,
    type: choose(FOODS),
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
    seedLevel: 0,
    speedLevel: 0,
    hitFlash: 0,
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
  const used = mode === "single" ? members.slice(0, 1) : members.slice(0, MAX_PLAYERS)
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
    seedStacks: 0,
    speedStacks: 0,
    shieldStacks: 0,
    attackCooldown: 0,
    specialCooldown: 0,
    hurtCooldown: 0,
    alive: true,
    hitFlash: 0,
  }))
}

function makeGameState(mode: PlayMode, members: RoomMember[], roomCode: string | null): GameState {
  const level = LEVELS[0]
  return {
    players: createPlayers(mode, members),
    foods: Array.from({ length: level.foodTarget }, spawnFood),
    enemies: [],
    projectiles: [],
    particles: [],
    levelIndex: 0,
    wave: 0,
    pendingSpawns: [],
    nextWaveAt: performance.now() + 1000,
    sharedScore: 0,
    activeEvent: null,
    eventUntil: 0,
    nextEventAt: performance.now() + level.eventDelay,
    banner: `${level.name}`,
    bannerUntil: performance.now() + 2400,
    mode,
    roomCode,
  }
}

function buildWave(level: LevelConfig, wave: number): SpawnOrder[] {
  const pool: { type: EnemyType; cost: number }[] = [
    { type: "slither", cost: 1 },
    { type: "spitter", cost: level.level >= 2 ? 2 : 99 },
    { type: "charger", cost: level.level >= 3 ? 2 : 99 },
    { type: "splitter", cost: level.level >= 4 ? 3 : 99 },
    { type: "orbiter", cost: level.level >= 6 ? 3 : 99 },
  ].filter((entry) => entry.cost < 90)

  const orders: SpawnOrder[] = []
  let budget = level.enemyBudget + wave * 2

  if (level.miniBossWave === wave) {
    orders.push({ at: 0, type: "miniBoss", tier: clamp(2 + Math.floor(level.level / 4), 2, 4) })
    budget = Math.max(0, budget - 4)
  }
  if (level.bossWave === wave) {
    orders.push({ at: 0, type: "boss", tier: 4 })
    budget = Math.max(0, budget - 6)
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
  const dir = norm(target.x - player.x, target.y - player.y)
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
        life: 80,
        radius: 6 + player.fireStacks,
        color: "#ff6b2f",
        damage: (8 + player.fireStacks * 4) * projectileMul,
        kind: "fire",
      })
    }
    player.attackCooldown = 260
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
        life: 62,
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
      life: 52,
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
      life: 74,
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
      life: 58,
      radius: 4,
      color: "#d5bb7a",
      damage: 5 * projectileMul,
      kind: "seed",
    })
    player.attackCooldown = 360
  }

  if (player.fireStacks >= 3 && player.specialCooldown <= 0) {
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
        life: 34,
        radius: 5,
        color: "#ff9152",
        damage: 5 * projectileMul,
        kind: "fire",
      })
    }
  }
}

function playerEatFood(player: PlayerState, food: FoodType) {
  player.hp = Math.min(player.maxHp, player.hp + food.heal)
  if (food.power === "fire") player.fireStacks = clamp(player.fireStacks + food.stackValue, 0, PLAYER_MAX_STACK)
  if (food.power === "seeds") player.seedStacks = clamp(player.seedStacks + food.stackValue, 0, PLAYER_MAX_STACK)
  if (food.power === "speed") player.speedStacks = clamp(player.speedStacks + food.stackValue, 0, PLAYER_MAX_STACK)
  if (food.power === "shield") player.shieldStacks = clamp(player.shieldStacks + food.stackValue, 0, MAX_SHIELDS)
}

function enemyEatFood(enemy: EnemyState, food: FoodType) {
  enemy.hp = Math.min(enemy.maxHp, enemy.hp + food.heal * 0.7)
  if (food.power === "fire") {
    enemy.fireLevel = clamp(enemy.fireLevel + 1, 0, 3)
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
  const dir = norm(target.x - enemy.x, target.y - enemy.y)
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
      vx: Math.cos(angle) * (5.2 + enemy.seedLevel * 0.35),
      vy: Math.sin(angle) * (5.2 + enemy.seedLevel * 0.35),
      life: 92,
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
      life: 90,
      radius: 6,
      color: "#ff5e5e",
      damage: 8,
      kind: "venom",
    })
  }
}

function saveHighscore(entry: HighscoreEntry) {
  if (typeof window === "undefined") return
  const existing = loadHighscores()
  const merged = [...existing, entry].sort((a, b) => b.score - a.score).slice(0, 10)
  window.localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(merged))
}

function loadHighscores(): HighscoreEntry[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(HIGHSCORE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as HighscoreEntry[]
    return Array.isArray(parsed) ? parsed : []
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
  const scoreSavedRef = useRef(false)
  const lastStateBroadcastRef = useRef(0)

  const [status, setStatus] = useState<Status>("menu")
  const [mode, setMode] = useState<PlayMode>("single")
  const [playerName, setPlayerName] = useState("Player")
  const [joinCode, setJoinCode] = useState("")
  const [roomCode, setRoomCode] = useState("")
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([])
  const [roomNotice, setRoomNotice] = useState("")
  const [highscores, setHighscores] = useState<HighscoreEntry[]>([])
  const [hud, setHud] = useState({
    hp: 100,
    score: 0,
    level: 1,
    levelName: LEVELS[0].name,
    wave: 0,
    waves: LEVELS[0].waves,
    fusion: "Plain Paws",
    players: 1,
    bossHp: 0,
    bossMaxHp: 0,
    eventName: "",
    eventColor: "",
    roomCode: "",
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
      const boss = state.enemies.find((enemy) => enemy.type === "boss" || enemy.type === "miniBoss")
      const level = currentLevel(state)
      setHud({
        hp: Math.round(localPlayer?.hp ?? 0),
        score: Math.round(localPlayer?.score ?? state.sharedScore ?? 0),
        level: level.level,
        levelName: level.name,
        wave: state.wave,
        waves: level.waves,
        fusion: localPlayer ? powerLabel(localPlayer) : "Plain Paws",
        players: state.players.filter((player) => player.alive).length,
        bossHp: boss ? Math.round(boss.hp) : 0,
        bossMaxHp: boss ? Math.round(boss.maxHp) : 0,
        eventName: state.activeEvent?.name ?? "",
        eventColor: state.activeEvent?.color ?? "",
        roomCode: state.roomCode ?? "",
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

  const startSinglePlayer = useCallback(() => {
    closeRoom()
    const members: RoomMember[] = [{ id: playerIdRef.current, name: playerName || "Player", isHost: true }]
    const state = makeGameState("single", members, null)
    stateRef.current = state
    scoreSavedRef.current = false
    remoteInputsRef.current = {}
    setStatus("playing")
    updateHudFromState(state)
  }, [closeRoom, playerName, updateHudFromState])

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
    return () => closeRoom()
  }, [closeRoom])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      keysRef.current[event.key.toLowerCase()] = true
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
  }, [])

  const localInput = useCallback((): InputState => {
    const keys = keysRef.current
    return {
      up: !!(keys["w"] || keys["arrowup"]),
      down: !!(keys["s"] || keys["arrowdown"]),
      left: !!(keys["a"] || keys["arrowleft"]),
      right: !!(keys["d"] || keys["arrowright"]),
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

      if (state.pendingSpawns.length === 0 && state.enemies.length === 0) {
        if (state.wave === 0 || now >= state.nextWaveAt) {
          if (state.wave >= level.waves) {
            if (state.levelIndex >= LEVELS.length - 1) {
              if (channelRef.current && roomRoleRef.current === "host") {
                channelRef.current.postMessage({ type: "state", state, status: "won" } satisfies RoomMessage)
              }
              setStatus("won")
              maybeSaveResult("won")
              return
            }
            state.levelIndex += 1
            const nextLevel = currentLevel(state)
            state.wave = 0
            state.nextWaveAt = now + 1600
            state.foods = Array.from({ length: nextLevel.foodTarget }, spawnFood)
            for (const player of state.players) {
              player.hp = Math.min(player.maxHp, player.hp + 24)
              player.score += 30
            }
            state.sharedScore = state.players.reduce((sum, player) => sum + player.score, 0)
            queueBanner(state, `Level ${nextLevel.level}: ${nextLevel.name}`, now)
          } else {
            state.wave += 1
            state.pendingSpawns = buildWave(level, state.wave)
            state.pendingSpawns.forEach((spawn) => {
              spawn.at = now + spawn.at
            })
            queueBanner(state, `Wave ${state.wave}/${level.waves}`, now)
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
      while (state.foods.length < foodTarget) state.foods.push(spawnFood())

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
          const direction = norm(ax, ay)
          const speedMul = (state.activeEvent?.playerSpeedMul ?? 1) * (1 + player.speedStacks * 0.15)
          player.vx += direction.x * 0.95 * speedMul * dt
          player.vy += direction.y * 0.95 * speedMul * dt
          player.facing = direction
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
            playerEatFood(player, food.type)
            player.score += 12
            state.sharedScore += 12
            addParticles(state, food.x, food.y, food.type.color, 10, 3)
            state.foods.splice(i, 1)
          }
        }
      }

      for (const enemy of state.enemies) {
        enemy.reload -= dt * 16.6
        enemy.summonCooldown -= dt * 16.6
        enemy.dashCooldown -= dt * 16.6
        enemy.hitFlash *= 0.86
        const target = nearestPlayer(enemy, state.players)
        if (!target) continue

        let move = norm(target.x - enemy.x, target.y - enemy.y)
        const distance = Math.hypot(target.x - enemy.x, target.y - enemy.y)
        enemy.wiggle += 0.13 * dt
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
        const speedMul = (1 + enemy.speedLevel * 0.12) * eventMul
        const drift = enemy.type === "slither" || enemy.type === "splitter" ? Math.sin(enemy.wiggle) * 0.38 : 0
        const moveAngle = Math.atan2(move.y, move.x) + drift
        enemy.x += Math.cos(moveAngle) * enemy.speed * speedMul * dashMul * dt
        enemy.y += Math.sin(moveAngle) * enemy.speed * speedMul * dashMul * dt
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
              addParticles(state, projectile.x, projectile.y, projectile.color, 8, 3)
              projectile.life = -1
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
        const reward = ENEMY_TIERS[enemy.tier].reward + enemy.fireLevel * 4 + enemy.seedLevel * 4
        for (const player of state.players) {
          if (player.alive) player.score += reward
        }
        state.sharedScore += reward

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

    for (const food of state.foods) {
      ctx.fillStyle = "rgba(0,0,0,0.2)"
      ctx.beginPath()
      ctx.ellipse(food.x, food.y + 13, 11, 4, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = "26px serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(food.type.emoji, food.x, food.y)
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
      ctx.save()
      ctx.translate(enemy.x, enemy.y)
      ctx.fillStyle = "rgba(0,0,0,0.25)"
      ctx.beginPath()
      ctx.ellipse(3, enemy.size + 5, enemy.size * 0.95, 5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = enemy.hitFlash > 0.1 ? "#fff5dd" : tier.colorDark
      ctx.beginPath()
      ctx.arc(0, 0, enemy.size + 2, 0, Math.PI * 2)
      ctx.fill()
      const body = ctx.createRadialGradient(-enemy.size * 0.3, -enemy.size * 0.3, 1, 0, 0, enemy.size)
      body.addColorStop(0, tier.color)
      body.addColorStop(1, tier.colorDark)
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.arc(0, 0, enemy.size, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#1f1308"
      ctx.beginPath()
      ctx.arc(enemy.size * 0.26, -3, 2.1, 0, Math.PI * 2)
      ctx.arc(enemy.size * 0.26, 3, 2.1, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#fff"
      ctx.font = enemy.type === "boss" ? "bold 12px ui-sans-serif" : "bold 10px ui-sans-serif"
      ctx.fillText(
        enemy.type === "boss" ? "BOSS" : enemy.type === "miniBoss" ? "MINI" : enemy.type[0].toUpperCase(),
        0,
        3,
      )
      ctx.restore()

      const barW = enemy.type === "boss" ? 88 : enemy.type === "miniBoss" ? 64 : 36
      const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1)
      ctx.fillStyle = "rgba(0,0,0,0.45)"
      ctx.fillRect(enemy.x - barW / 2 - 1, enemy.y - enemy.size - 18, barW + 2, 7)
      ctx.fillStyle = enemy.type === "boss" ? "#ff6b6b" : enemy.type === "miniBoss" ? "#ffae52" : "#7fe07f"
      ctx.fillRect(enemy.x - barW / 2, enemy.y - enemy.size - 17, barW * ratio, 5)
    }

    for (const player of state.players) {
      if (!player.alive) continue
      ctx.save()
      ctx.translate(player.x, player.y)
      const facingAngle = Math.atan2(player.facing.y, player.facing.x)
      ctx.rotate(facingAngle)
      ctx.fillStyle = "rgba(0,0,0,0.24)"
      ctx.beginPath()
      ctx.ellipse(0, player.r + 2, player.r * 0.9, 5, 0, 0, Math.PI * 2)
      ctx.fill()

      ctx.save()
      ctx.translate(-player.r - 4, 0)
      ctx.rotate(Math.sin(now / 180 + player.x * 0.02) * 0.28)
      ctx.fillStyle = "#8a5526"
      ctx.beginPath()
      ctx.ellipse(-7, 0, 14, 9, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      ctx.fillStyle = player.hitFlash > 0.1 ? "#fff1cf" : playerColor(player)
      ctx.beginPath()
      ctx.arc(0, 0, player.r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#f1d399"
      ctx.beginPath()
      ctx.ellipse(3, 2, 8, 10, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#1e140d"
      ctx.beginPath()
      ctx.arc(8, -4, 2.5, 0, Math.PI * 2)
      ctx.arc(8, 4, 2.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#fff"
      ctx.font = "bold 11px ui-sans-serif"
      ctx.fillText(player.name.slice(0, 8), 0, -24)
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
        const hostDriven = state.mode === "single" || roomRoleRef.current === "host"
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
          className="block w-full bg-[#2f512b]"
          style={{ aspectRatio: `${WORLD.w}/${WORLD.h}` }}
        />

        {status === "playing" && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 text-white">
            <div className="rounded-2xl bg-black/45 px-4 py-3 backdrop-blur-sm">
              <div className="mb-1 flex items-center gap-2 text-sm font-bold">
                <span>HP</span>
                <div className="h-2.5 w-28 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-[#68dd68]" style={{ width: `${hud.hp}%` }} />
                </div>
                <span className="font-mono text-xs">{hud.hp}</span>
              </div>
              <div className="text-xs font-mono">Score {hud.score}</div>
              <div className="text-xs font-mono">Fusion {hud.fusion}</div>
            </div>

            <div className="flex flex-col items-center gap-1">
              <div className="rounded-full bg-black/45 px-4 py-2 text-sm font-bold text-white backdrop-blur-sm">
                Level {hud.level} - {hud.levelName}
              </div>
              <div className="rounded-full bg-black/45 px-4 py-1 text-xs text-white/85 backdrop-blur-sm">
                Wave {hud.wave}/{hud.waves}
              </div>
              {hud.eventName && (
                <div
                  className="rounded-full px-4 py-1 text-xs font-bold backdrop-blur-sm"
                  style={{ background: "rgba(0,0,0,0.55)", color: hud.eventColor }}
                >
                  {hud.eventName}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-black/45 px-4 py-3 text-right text-xs text-white backdrop-blur-sm">
              <div>Players alive: {hud.players}</div>
              {hud.roomCode && <div>Room {hud.roomCode}</div>}
              {hud.bossMaxHp > 0 && (
                <>
                  <div className="mt-2 font-bold text-[#ff8a8a]">Boss HP</div>
                  <div className="mt-1 h-2.5 w-36 overflow-hidden rounded-full bg-white/15">
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
        )}

        {status === "menu" && (
          <div className="absolute inset-0 flex flex-col justify-between bg-[radial-gradient(circle_at_top,#4b2d1a,transparent_45%),linear-gradient(180deg,rgba(17,12,9,0.92),rgba(5,5,5,0.96))] p-6 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-4xl font-black tracking-tight md:text-5xl">Squirrel Fusion</h1>
                <p className="mt-2 max-w-xl text-sm text-white/75 md:text-base">
                  10 niveluri, wave-uri progresive, mini-boss la nivelul 5, Viper King la nivelul 10 si room co-op local
                  pe baza de cod.
                </p>
              </div>
              <div className="min-w-[220px] rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="mb-2 text-sm font-bold uppercase tracking-wide text-[#ffcb8a]">Highscores</div>
                <div className="space-y-2 text-xs">
                  {highscores.length === 0 && <div className="text-white/55">No runs yet.</div>}
                  {highscores.map((entry, index) => (
                    <div key={entry.id} className="flex items-center justify-between gap-2">
                      <span>
                        {index + 1}. {entry.name}
                      </span>
                      <span className="font-mono text-[#ffd966]">{entry.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-[1.3fr_1fr]">
              <div className="rounded-[24px] border border-white/10 bg-black/30 p-5 backdrop-blur-sm">
                <div className="mb-4 flex gap-2 text-sm font-semibold">
                  <button
                    onClick={() => setMode("single")}
                    className={`rounded-full px-4 py-2 ${mode === "single" ? "bg-[#ff8f57] text-black" : "bg-white/10 text-white"}`}
                  >
                    Single Player
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
                      Play
                    </button>
                    <p className="text-sm text-white/65">
                      Fuziunea veveritei evolueaza pe baza food-urilor. Sarpii vin in wave-uri din afara ecranului si devin
                      tot mai agresivi pe parcurs.
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

              <div className="rounded-[24px] border border-white/10 bg-black/25 p-5 text-sm text-white/75 backdrop-blur-sm">
                <div className="mb-3 text-sm font-bold uppercase tracking-wide text-[#9dde6d]">What Changed</div>
                <ul className="space-y-2">
                  <li>Wave-based difficulty instead of abrupt jumps.</li>
                  <li>Enemies spawn from outside the visible screen.</li>
                  <li>New enemy types: spitter, charger, splitter, orbiter, mini-boss, boss.</li>
                  <li>Random events never overlap while one is active.</li>
                  <li>Player and enemies both evolve from power foods.</li>
                </ul>
              </div>
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
                  if (mode === "single") startSinglePlayer()
                  else backToMenu()
                }}
                className="rounded-2xl bg-[#ff8f57] px-5 py-3 font-bold text-black"
              >
                {mode === "single" ? "Play Again" : "Back to Lobby"}
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
                <div className="mt-2 text-sm font-bold">{food.powerName}</div>
                <div className="mt-1 text-xs text-muted-foreground">{food.description}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-border bg-card p-4">
          <div className="mb-3 text-sm font-bold uppercase tracking-wide text-card-foreground">Controls</div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div>`WASD` or arrow keys to move.</div>
            <div>Attacks fire automatically based on your strongest fusion.</div>
            <div>In co-op, the room works across browser tabs with the same code.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
