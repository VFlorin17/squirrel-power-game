"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  FOODS,
  SNAKE_STAGES,
  LEVELS,
  MAX_SHIELDS,
  MAX_SNAKES,
  SNAKE_EVOLVE_MS,
  SEED_DMG,
  FIRE_DMG,
  BIOMES,
  EVENTS,
  SNAKE_FOOD_DASH_FRACTION,
  type FoodType,
  type PowerId,
  type Biome,
  type GameEvent,
  type LevelConfig,
} from "@/lib/game-config"

const WORLD = { w: 900, h: 600 }

type Strategy = "chaser" | "flanker" | "ambusher"

interface Vec {
  x: number
  y: number
}

interface FoodItem extends Vec {
  type: FoodType
  id: number
  born: number
}

interface Projectile extends Vec {
  vx: number
  vy: number
  kind: "seed" | "fire"
  life: number
  id: number
}

interface Snake {
  id: number
  segs: Vec[]
  stage: number
  hp: number
  maxHp: number
  evolveAt: number
  strategy: Strategy
  wiggle: number
  heading: number
  reTargetAt: number
  aim: Vec
  boost: number // transient speed multiplier bonus from eating food
  isBoss?: boolean
  bossName?: string
}

interface GameState {
  player: Vec & { vx: number; vy: number; r: number; hp: number; facing: Vec; walk: number }
  power: { id: PowerId; until: number; name: string }
  shields: number
  target: Vec | null
  foods: FoodItem[]
  projectiles: Projectile[]
  snakes: Snake[]
  score: number
  particles: { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }[]
  floaters: { x: number; y: number; vy: number; life: number; text: string; color: string }[]
  shake: number
  biomeIndex: number
  nextFusionScore: number
  fusionFlash: number
  event: GameEvent | null
  eventUntil: number
  nextEventAt: number
  levelIndex: number
  bossDefeated: boolean
}

type Status = "menu" | "playing" | "dead" | "won"

let idCounter = 1
const nextId = () => idCounter++

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function spawnFood(): FoodItem {
  const type = FOODS[Math.floor(Math.random() * FOODS.length)]
  return { type, id: nextId(), x: rand(50, WORLD.w - 50), y: rand(50, WORLD.h - 50), born: performance.now() }
}

const STRATEGIES: Strategy[] = ["chaser", "flanker", "ambusher"]

function makeSnake(stage: number, x: number, y: number, now: number): Snake {
  const st = SNAKE_STAGES[stage]
  return {
    id: nextId(),
    stage,
    hp: st.hp,
    maxHp: st.hp,
    evolveAt: now + SNAKE_EVOLVE_MS,
    strategy: STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)],
    wiggle: rand(0, Math.PI * 2),
    heading: rand(0, Math.PI * 2),
    reTargetAt: 0,
    aim: { x, y },
    boost: 0,
    segs: Array.from({ length: st.segments }, (_, i) => ({ x, y: y + i * 4 })),
  }
}

function levelSnakes(levelIndex: number, now: number): Snake[] {
  if (levelIndex === 0) {
    return [makeSnake(0, 90, 90, now), makeSnake(0, WORLD.w - 110, WORLD.h - 110, now)]
  }
  if (levelIndex === 1) {
    return [
      makeSnake(1, 110, 90, now),
      makeSnake(1, WORLD.w - 120, 110, now),
      makeSnake(2, WORLD.w / 2, WORLD.h - 120, now),
    ]
  }

  const boss = makeSnake(4, WORLD.w / 2, 130, now)
  boss.isBoss = true
  boss.bossName = "Viper King"
  boss.maxHp = 320
  boss.hp = 320
  boss.evolveAt = Number.POSITIVE_INFINITY
  boss.strategy = "chaser"
  return [boss]
}

function getLevel(index: number): LevelConfig {
  return LEVELS[Math.min(index, LEVELS.length - 1)]
}

export default function SquirrelGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<GameState | null>(null)
  const keysRef = useRef<Record<string, boolean>>({})
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const lastShotRef = useRef<number>(0)

  const [status, setStatus] = useState<Status>("menu")
  const [hud, setHud] = useState({
    hp: 100,
    score: 0,
    power: "none" as PowerId,
    powerName: "",
    powerLeft: 0,
    shields: 0,
    topStage: 0,
    snakeCount: 1,
    biomeIndex: 0,
    eventName: "",
    eventColor: "",
    eventLeft: 0,
    levelName: LEVELS[0].name,
    objective: LEVELS[0].objective,
    bossHp: 0,
    bossMaxHp: 0,
  })

  const createState = useCallback((): GameState => {
    const now = performance.now()
    return {
      player: { x: WORLD.w / 2, y: WORLD.h / 2, vx: 0, vy: 0, r: 16, hp: 100, facing: { x: 1, y: 0 }, walk: 0 },
      power: { id: "none", until: 0, name: "" },
      shields: 0,
      target: null,
      foods: Array.from({ length: 5 }, spawnFood),
      projectiles: [],
      snakes: levelSnakes(0, now),
      score: 0,
      particles: [],
      floaters: [],
      shake: 0,
      biomeIndex: 0,
      nextFusionScore: 200,
      fusionFlash: 0,
      event: null,
      eventUntil: 0,
      nextEventAt: now + rand(7000, 12000),
      levelIndex: 0,
      bossDefeated: false,
    }
  }, [])

  const start = useCallback(() => {
    stateRef.current = createState()
    lastTimeRef.current = performance.now()
    setStatus("playing")
  }, [createState])

  const burst = (s: GameState, x: number, y: number, color: string, n = 12, spread = 4, size = 3) => {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2)
      const sp = rand(1, spread)
      s.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        max: 1,
        color,
        size: rand(size * 0.6, size),
      })
    }
  }

  const floater = (s: GameState, x: number, y: number, text: string, color: string) => {
    s.floaters.push({ x, y, vy: -0.7, life: 1, text, color })
  }

  const shoot = useCallback(() => {
    const s = stateRef.current
    if (!s || status !== "playing") return
    const now = performance.now()
    if (now - lastShotRef.current < 320) return
    const p = s.player
    // auto-aim at the nearest snake head; fall back to facing direction
    let f = p.facing
    let nearest: Snake | null = null
    let nd = Infinity
    for (const sn of s.snakes) {
      const h = sn.segs[0]
      const d = Math.hypot(h.x - p.x, h.y - p.y)
      if (d < nd) {
        nd = d
        nearest = sn
      }
    }
    if (nearest) {
      const h = nearest.segs[0]
      const a = Math.atan2(h.y - p.y, h.x - p.x)
      f = { x: Math.cos(a), y: Math.sin(a) }
      p.facing = f
    }
    if (s.power.id === "seeds") {
      lastShotRef.current = now
      for (let i = 0; i < 10; i++) {
        const spread = (i - 4.5) * 0.11
        const ang = Math.atan2(f.y, f.x) + spread
        s.projectiles.push({
          x: p.x,
          y: p.y,
          vx: Math.cos(ang) * 7.5,
          vy: Math.sin(ang) * 7.5,
          kind: "seed",
          life: 70,
          id: nextId(),
        })
      }
      burst(s, p.x, p.y, "#c9a23a", 6, 3, 2)
    } else if (s.power.id === "fire") {
      lastShotRef.current = now
      const baseAng = Math.atan2(f.y, f.x)
      for (let i = 0; i < 3; i++) {
        const ang = baseAng + (i - 1) * 0.16
        s.projectiles.push({
          x: p.x,
          y: p.y,
          vx: Math.cos(ang) * 6.5,
          vy: Math.sin(ang) * 6.5,
          kind: "fire",
          life: 55,
          id: nextId(),
        })
      }
      burst(s, p.x, p.y, "#ff7a1a", 8, 4, 3)
    }
  }, [status])

  // keyboard input
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      keysRef.current[k] = true
      if (k === " " || k === "spacebar") {
        e.preventDefault()
        shoot()
      }
      // any movement key cancels click-to-move
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        const s = stateRef.current
        if (s) s.target = null
      }
    }
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [shoot])

  // pointer (click-to-move target)
  const setTargetFromEvent = useCallback((clientX: number, clientY: number) => {
    const s = stateRef.current
    const canvas = canvasRef.current
    if (!s || !canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * WORLD.w
    const y = ((clientY - rect.top) / rect.height) * WORLD.h
    s.target = { x: Math.max(0, Math.min(WORLD.w, x)), y: Math.max(0, Math.min(WORLD.h, y)) }
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (status !== "playing") return
    setTargetFromEvent(e.clientX, e.clientY)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (status !== "playing") return
    if (e.buttons === 1) setTargetFromEvent(e.clientX, e.clientY)
  }

  // game loop
  useEffect(() => {
    if (status !== "playing") return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!

    const loop = (time: number) => {
      const s = stateRef.current!
      const dt = Math.min(32, time - lastTimeRef.current) / 16.6667
      lastTimeRef.current = time
      const now = time

      const p = s.player
      const k = keysRef.current

      const biome = BIOMES[s.biomeIndex]
      const level = getLevel(s.levelIndex)

      if (s.levelIndex < LEVELS.length - 1 && s.score >= level.targetScore) {
        s.levelIndex += 1
        const nextLevel = getLevel(s.levelIndex)
        s.biomeIndex = Math.min(s.levelIndex, BIOMES.length - 1)
        s.snakes = levelSnakes(s.levelIndex, now)
        s.projectiles = []
        s.foods = Array.from({ length: BIOMES[s.biomeIndex].foodTarget }, spawnFood)
        s.event = null
        s.eventUntil = 0
        s.nextEventAt = now + rand(7000, 12000)
        s.target = null
        burst(s, p.x, p.y, BIOMES[s.biomeIndex].accent, 48, 7, 5)
        floater(s, p.x, p.y - 28, nextLevel.name, BIOMES[s.biomeIndex].accent)
        floater(s, p.x, p.y - 48, nextLevel.objective, "#ffffff")
        s.shake = Math.min(14, s.shake + 10)
      }

      // --- fusion: every milestone score, the world fuses into a new biome ---
      if (s.levelIndex < LEVELS.length - 1 && s.score >= s.nextFusionScore) {
        s.biomeIndex = (s.biomeIndex + 1) % BIOMES.length
        s.nextFusionScore += 250
        s.fusionFlash = 1
        const nb = BIOMES[s.biomeIndex]
        burst(s, p.x, p.y, nb.accent, 40, 7, 5)
        floater(s, p.x, p.y - 30, `FUSION: ${nb.name}`, nb.accent)
        s.shake = Math.min(12, s.shake + 8)
      }
      s.fusionFlash *= 0.93

      // --- random timed events ---
      if (s.event && now > s.eventUntil) {
        s.event = null
        s.nextEventAt = now + rand(8000, 14000)
      }
      if (!s.event && now > s.nextEventAt) {
        const ev = EVENTS[Math.floor(Math.random() * EVENTS.length)]
        s.event = ev
        s.eventUntil = now + ev.duration
        floater(s, p.x, p.y - 30, `${ev.name}!`, ev.color)
        burst(s, p.x, p.y, ev.color, 28, 6, 4)
      }
      const ev = s.event

      let ax = 0
      let ay = 0
      if (k["arrowup"] || k["w"]) ay -= 1
      if (k["arrowdown"] || k["s"]) ay += 1
      if (k["arrowleft"] || k["a"]) ax -= 1
      if (k["arrowright"] || k["d"]) ax += 1

      const eventSpeed = ev?.id === "swift" ? 1.4 : 1
      const speedBoost = (s.power.id === "speed" ? 1.9 : 1) * biome.playerSpeedMul * eventSpeed
      const accel = 0.9 * speedBoost

      if (ax || ay) {
        const len = Math.hypot(ax, ay)
        ax /= len
        ay /= len
        p.vx += ax * accel
        p.vy += ay * accel
        p.facing = { x: ax, y: ay }
      } else if (s.target) {
        const tdx = s.target.x - p.x
        const tdy = s.target.y - p.y
        const td = Math.hypot(tdx, tdy)
        if (td < 6) {
          s.target = null
        } else {
          const nx = tdx / td
          const ny = tdy / td
          p.vx += nx * accel
          p.vy += ny * accel
          p.facing = { x: nx, y: ny }
        }
      }

      const maxSpd = 4.5 * speedBoost
      p.vx *= biome.friction
      p.vy *= biome.friction
      const psp = Math.hypot(p.vx, p.vy)
      if (psp > maxSpd) {
        p.vx = (p.vx / psp) * maxSpd
        p.vy = (p.vy / psp) * maxSpd
      }
      p.x = Math.max(p.r, Math.min(WORLD.w - p.r, p.x + p.vx * dt))
      p.y = Math.max(p.r, Math.min(WORLD.h - p.r, p.y + p.vy * dt))
      p.walk += psp * 0.06 * dt

      // power expiry (shield is count-based, never expires by time)
      if (s.power.id !== "none" && s.power.id !== "shield" && now > s.power.until) {
        s.power = { id: "none", until: 0, name: "" }
      }

      // auto-fire whenever an offensive power is active and a snake is around
      if ((s.power.id === "seeds" || s.power.id === "fire") && s.snakes.length > 0) {
        shoot()
      }

      // eat food
      for (let i = s.foods.length - 1; i >= 0; i--) {
        const f = s.foods[i]
        if (Math.hypot(f.x - p.x, f.y - p.y) < p.r + 14) {
          p.hp = Math.min(100, p.hp + f.type.heal)
          s.score += 10
          burst(s, f.x, f.y, f.type.color, 16, 4, 3)
          if (f.type.heal > 0) floater(s, f.x, f.y, `+${f.type.heal}`, "#7fe07f")

          if (f.type.power === "shield") {
            if (s.shields < MAX_SHIELDS) {
              s.shields++
              floater(s, p.x, p.y - 10, `Shield x${s.shields}`, "#e8c98f")
            } else {
              floater(s, p.x, p.y - 10, "Shield MAX", "#e8c98f")
            }
          } else if (f.type.power !== "none") {
            if (s.power.id === f.type.power) {
              // same power: stack duration
              s.power.until += f.type.duration
              floater(s, p.x, p.y - 10, `${f.type.powerName} +`, f.type.color)
            } else {
              s.power = { id: f.type.power, until: now + f.type.duration, name: f.type.powerName }
              floater(s, p.x, p.y - 10, f.type.powerName, f.type.color)
            }
          }
          s.foods.splice(i, 1)
        }
      }
      const foodTarget = biome.foodTarget + (ev?.id === "feast" ? 6 : 0)
      while (s.foods.length < foodTarget) s.foods.push(spawnFood())

      // projectiles move
      for (let i = s.projectiles.length - 1; i >= 0; i--) {
        const pr = s.projectiles[i]
        pr.x += pr.vx * dt
        pr.y += pr.vy * dt
        pr.life -= dt
        if (pr.kind === "fire" && Math.random() < 0.5) {
          s.particles.push({
            x: pr.x,
            y: pr.y,
            vx: rand(-0.5, 0.5),
            vy: rand(-0.5, 0.5),
            life: 0.6,
            max: 0.6,
            color: "#ffb347",
            size: rand(2, 4),
          })
        }
        if (pr.life <= 0 || pr.x < 0 || pr.x > WORLD.w || pr.y < 0 || pr.y > WORLD.h) {
          s.projectiles.splice(i, 1)
        }
      }

      // --- snakes update ---
      const newSnakes: Snake[] = []
      for (let si = s.snakes.length - 1; si >= 0; si--) {
        const snake = s.snakes[si]
        const st = SNAKE_STAGES[snake.stage]
        const segs = snake.segs
        const head = segs[0]

        // time-based evolution
        if (!snake.isBoss && now > snake.evolveAt && snake.stage < SNAKE_STAGES.length - 1) {
          snake.stage++
          const ns = SNAKE_STAGES[snake.stage]
          const ratio = snake.hp / snake.maxHp
          snake.maxHp = ns.hp
          snake.hp = Math.max(ns.hp * ratio, ns.hp * 0.5)
          snake.evolveAt = now + SNAKE_EVOLVE_MS
          while (segs.length < ns.segments) {
            const tail = segs[segs.length - 1]
            segs.push({ x: tail.x, y: tail.y })
          }
          burst(s, head.x, head.y, ns.color, 26, 5, 4)
          floater(s, head.x, head.y - 14, ns.name, ns.color)
        }

        // strategy: pick an aim point, re-evaluated periodically
        if (now > snake.reTargetAt) {
          snake.reTargetAt = now + rand(600, 1400)
          // occasionally a snake decides to grab nearby food instead of chasing
          let foodGoal: Vec | null = null
          if (Math.random() < 0.35 && s.foods.length > 0) {
            let best: FoodItem | null = null
            let bd = Infinity
            for (const f of s.foods) {
              const d = Math.hypot(f.x - head.x, f.y - head.y)
              if (d < 240 && d < bd) {
                bd = d
                best = f
              }
            }
            if (best) foodGoal = { x: best.x, y: best.y }
          }
          if (foodGoal) {
            snake.aim = foodGoal
          } else if (snake.strategy === "flanker") {
            // aim ahead of the player's velocity
            snake.aim = { x: p.x + p.vx * 26, y: p.y + p.vy * 26 }
          } else if (snake.strategy === "ambusher") {
            // circle to a point offset around the player
            const a = rand(0, Math.PI * 2)
            const rad = rand(120, 200)
            snake.aim = { x: p.x + Math.cos(a) * rad, y: p.y + Math.sin(a) * rad }
          } else {
            snake.aim = { x: p.x, y: p.y }
          }
        }
        // chasers always track live; others drift toward aim then dive when close
        const distToPlayer = Math.hypot(p.x - head.x, p.y - head.y)
        let goal = snake.aim
        if (snake.strategy === "chaser" || distToPlayer < 150) goal = { x: p.x, y: p.y }

        const desired = Math.atan2(goal.y - head.y, goal.x - head.x)
        // smooth turn toward desired heading
        let diff = desired - snake.heading
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        snake.heading += diff * 0.08 * dt
        // serpentine wiggle perpendicular to heading
        snake.wiggle += 0.22 * dt
        const wiggleAmt = Math.sin(snake.wiggle) * 0.5
        const moveAng = snake.heading + wiggleAmt
        // biome + event speed modifiers, plus transient food boost (decays)
        snake.boost *= 0.985
        const eventSnakeMul = ev?.id === "frenzy" ? 1.5 : ev?.id === "lull" ? 0.55 : 1
        const snakeSpeed = st.speed * biome.snakeSpeedMul * eventSnakeMul * (1 + snake.boost)
        head.x += Math.cos(moveAng) * snakeSpeed * dt
        head.y += Math.sin(moveAng) * snakeSpeed * dt
        head.x = Math.max(6, Math.min(WORLD.w - 6, head.x))
        head.y = Math.max(6, Math.min(WORLD.h - 6, head.y))

        // snake eats nearby food: tiny 3% dash effect + small heal
        for (let i = s.foods.length - 1; i >= 0; i--) {
          const f = s.foods[i]
          if (Math.hypot(f.x - head.x, f.y - head.y) < st.segSize + 12) {
            if (f.type.power === "speed") {
              snake.boost += (1.9 - 1) * SNAKE_FOOD_DASH_FRACTION // 3% of the player's dash bonus
              floater(s, head.x, head.y - 12, "dash", "#7fd6ff")
            }
            snake.hp = Math.min(snake.maxHp, snake.hp + 4)
            burst(s, f.x, f.y, f.type.color, 8, 3, 2)
            s.foods.splice(i, 1)
          }
        }

        const follow = st.segSize * 0.78
        for (let i = 1; i < segs.length; i++) {
          const prev = segs[i - 1]
          const cur = segs[i]
          const sdx = prev.x - cur.x
          const sdy = prev.y - cur.y
          const sd = Math.hypot(sdx, sdy) || 1
          if (sd > follow) {
            cur.x += (sdx / sd) * (sd - follow)
            cur.y += (sdy / sd) * (sd - follow)
          }
        }

        // projectile hits this snake
        for (let i = s.projectiles.length - 1; i >= 0; i--) {
          const pr = s.projectiles[i]
          let hit = false
          // check against several front segments for fairness
          for (let segI = 0; segI < Math.min(segs.length, 5); segI++) {
            const seg = segs[segI]
            if (Math.hypot(pr.x - seg.x, pr.y - seg.y) < st.segSize + 4) {
              hit = true
              break
            }
          }
          if (hit) {
            s.projectiles.splice(i, 1)
            const dmg = pr.kind === "fire" ? FIRE_DMG : SEED_DMG
            snake.hp -= dmg
            s.score += 2
            burst(s, pr.x, pr.y, pr.kind === "fire" ? "#ff7a1a" : "#c9a23a", 8, 4, 3)
            floater(s, pr.x, pr.y, `-${dmg}`, pr.kind === "fire" ? "#ff9a4a" : "#e8d18a")
            head.x -= Math.cos(snake.heading) * 6
            head.y -= Math.sin(snake.heading) * 6
          }
        }

        // snake head hits player
        if (distToPlayer < st.segSize + p.r - 4) {
          if (s.shields > 0) {
            s.shields--
            burst(s, p.x, p.y, "#e8c98f", 22, 5, 4)
            floater(s, p.x, p.y - 10, "Blocked!", "#e8c98f")
            const a = Math.atan2(head.y - p.y, head.x - p.x)
            head.x += Math.cos(a) * 70
            head.y += Math.sin(a) * 70
            snake.heading = a
          } else {
            p.hp -= 0.85 * dt * (1 + snake.stage * 0.25)
            s.shake = Math.min(8, s.shake + 0.6)
            if (Math.random() < 0.3) burst(s, p.x, p.y, "#e23b3b", 2, 3, 3)
          }
        }

        // snake death -> split into two
        if (snake.hp <= 0) {
          s.snakes.splice(si, 1)
          s.score += snake.isBoss ? 200 : 40
          burst(s, head.x, head.y, st.colorDark, 36, 6, 5)
          floater(s, head.x, head.y, snake.isBoss ? "Boss Down!" : "+40", "#ffd966")
          if (snake.isBoss) {
            s.bossDefeated = true
          } else {
            const childStage = Math.max(0, snake.stage - 1)
            const room = MAX_SNAKES - (s.snakes.length + newSnakes.length)
            const wantSplit = ev?.id === "split" ? 3 : 2
            const spawnCount = Math.min(wantSplit, room)
            for (let c = 0; c < spawnCount; c++) {
              const ox = head.x + rand(-40, 40)
              const oy = head.y + rand(-40, 40)
              newSnakes.push(
                makeSnake(
                  childStage,
                  Math.max(20, Math.min(WORLD.w - 20, ox)),
                  Math.max(20, Math.min(WORLD.h - 20, oy)),
                  now,
                ),
              )
            }
          }
        }
      }
      if (newSnakes.length) s.snakes.push(...newSnakes)
      // safety: keep normal levels populated, but let the boss stage end cleanly
      if (s.levelIndex < LEVELS.length - 1 && s.snakes.length === 0) {
        s.snakes.push(makeSnake(0, rand(40, WORLD.w - 40), 40, now))
      }
      if (s.levelIndex === LEVELS.length - 1 && s.bossDefeated && s.snakes.length === 0) {
        const currentLevel = getLevel(s.levelIndex)
        setHud({
          hp: Math.round(p.hp),
          score: s.score,
          power: s.power.id,
          powerName: s.power.name,
          powerLeft: s.power.id !== "none" && s.power.id !== "shield" ? Math.max(0, Math.ceil((s.power.until - now) / 1000)) : 0,
          shields: s.shields,
          topStage: 4,
          snakeCount: 0,
          biomeIndex: s.biomeIndex,
          eventName: "",
          eventColor: "",
          eventLeft: 0,
          levelName: currentLevel.name,
          objective: currentLevel.objective,
          bossHp: 0,
          bossMaxHp: 0,
        })
        setStatus("won")
        return
      }

      // particles
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const pt = s.particles[i]
        pt.x += pt.vx * dt
        pt.y += pt.vy * dt
        pt.vx *= 0.92
        pt.vy *= 0.92
        pt.life -= (0.03 / pt.max) * dt
        if (pt.life <= 0) s.particles.splice(i, 1)
      }
      // floaters
      for (let i = s.floaters.length - 1; i >= 0; i--) {
        const fl = s.floaters[i]
        fl.y += fl.vy * dt
        fl.life -= 0.014 * dt
        if (fl.life <= 0) s.floaters.splice(i, 1)
      }
      s.shake *= 0.86

      if (p.hp <= 0) {
        p.hp = 0
        setStatus("dead")
        setHud((h) => ({ ...h, hp: 0 }))
        return
      }

      draw(ctx, s, now)

      const currentLevel = getLevel(s.levelIndex)
      const topStage = s.snakes.reduce((m, sn) => Math.max(m, sn.stage), 0)
      const boss = s.snakes.find((sn) => sn.isBoss)
      setHud({
        hp: Math.round(p.hp),
        score: s.score,
        power: s.power.id,
        powerName: s.power.name,
        powerLeft: s.power.id !== "none" && s.power.id !== "shield" ? Math.max(0, Math.ceil((s.power.until - now) / 1000)) : 0,
        shields: s.shields,
        topStage,
        snakeCount: s.snakes.length,
        biomeIndex: s.biomeIndex,
        eventName: s.event?.name ?? "",
        eventColor: s.event?.color ?? "",
        eventLeft: s.event ? Math.max(0, Math.ceil((s.eventUntil - now) / 1000)) : 0,
        levelName: currentLevel.name,
        objective: currentLevel.objective,
        bossHp: boss ? Math.max(0, Math.round(boss.hp)) : 0,
        bossMaxHp: boss ? boss.maxHp : 0,
      })

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [status])

  const draw = (ctx: CanvasRenderingContext2D, s: GameState, now: number) => {
    ctx.save()
    if (s.shake > 0.2) {
      ctx.translate(rand(-s.shake, s.shake), rand(-s.shake, s.shake))
    }

    // background: biome-tinted gradient
    const biome = BIOMES[s.biomeIndex]
    const bg = ctx.createLinearGradient(0, 0, 0, WORLD.h)
    bg.addColorStop(0, biome.bgTop)
    bg.addColorStop(1, biome.bgBottom)
    ctx.fillStyle = bg
    ctx.fillRect(-10, -10, WORLD.w + 20, WORLD.h + 20)

    // grass / ground tufts in biome accent
    ctx.strokeStyle = biome.grass
    ctx.lineWidth = 1.5
    for (let gx = 8; gx < WORLD.w; gx += 34) {
      for (let gy = 14; gy < WORLD.h; gy += 34) {
        const sw = Math.sin((gx + gy + now * 0.001) * 0.5) * 2
        ctx.beginPath()
        ctx.moveTo(gx, gy)
        ctx.lineTo(gx + sw, gy - 7)
        ctx.stroke()
      }
    }

    // click target marker
    if (s.target) {
      const pulse = 6 + Math.sin(now / 120) * 2
      ctx.strokeStyle = "rgba(255,255,255,0.55)"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(s.target.x, s.target.y, pulse, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(s.target.x - 10, s.target.y)
      ctx.lineTo(s.target.x + 10, s.target.y)
      ctx.moveTo(s.target.x, s.target.y - 10)
      ctx.lineTo(s.target.x, s.target.y + 10)
      ctx.stroke()
    }

    // foods with glowing pulse + shadow
    for (const f of s.foods) {
      const pulse = 1 + Math.sin((now + f.id * 400) / 350) * 0.08
      // ground shadow
      ctx.fillStyle = "rgba(0,0,0,0.25)"
      ctx.beginPath()
      ctx.ellipse(f.x, f.y + 14, 11, 4, 0, 0, Math.PI * 2)
      ctx.fill()
      // glow halo
      const glow = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, 22)
      glow.addColorStop(0, f.type.color + "aa")
      glow.addColorStop(1, f.type.color + "00")
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(f.x, f.y, 22, 0, Math.PI * 2)
      ctx.fill()
      // emoji
      ctx.font = `${Math.round(28 * pulse)}px serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(f.type.emoji, f.x, f.y - 2 + Math.sin((now + f.id * 400) / 400) * 2)
    }

    // projectiles
    for (const pr of s.projectiles) {
      if (pr.kind === "fire") {
        const g = ctx.createRadialGradient(pr.x, pr.y, 1, pr.x, pr.y, 9)
        g.addColorStop(0, "#fff2b0")
        g.addColorStop(0.5, "#ff7a1a")
        g.addColorStop(1, "#ff7a1a00")
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(pr.x, pr.y, 9, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = "#e8d18a"
        ctx.strokeStyle = "#8a6a1f"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.ellipse(pr.x, pr.y, 4.5, 2.6, Math.atan2(pr.vy, pr.vx), 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }

    // snakes
    for (const snake of s.snakes) {
      const st = SNAKE_STAGES[snake.stage]
      const segs = snake.segs
      // body shadow
      ctx.fillStyle = "rgba(0,0,0,0.2)"
      for (let i = segs.length - 1; i >= 0; i--) {
        const seg = segs[i]
        const t = 1 - i / segs.length
        ctx.beginPath()
        ctx.arc(seg.x + 3, seg.y + 5, st.segSize * (0.6 + t * 0.4), 0, Math.PI * 2)
        ctx.fill()
      }
      // body segments with scale shading
      for (let i = segs.length - 1; i >= 0; i--) {
        const seg = segs[i]
        const t = 1 - i / segs.length
        const r = st.segSize * (0.6 + t * 0.4)
        const g = ctx.createRadialGradient(seg.x - r * 0.3, seg.y - r * 0.3, 1, seg.x, seg.y, r)
        g.addColorStop(0, st.color)
        g.addColorStop(1, st.colorDark)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(seg.x, seg.y, r, 0, Math.PI * 2)
        ctx.fill()
        // scale highlight every other seg
        if (i % 2 === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.12)"
          ctx.beginPath()
          ctx.arc(seg.x - r * 0.25, seg.y - r * 0.25, r * 0.35, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      // head
      const head = segs[0]
      const hr = st.segSize + 3
      const hg = ctx.createRadialGradient(head.x - hr * 0.3, head.y - hr * 0.3, 1, head.x, head.y, hr)
      hg.addColorStop(0, st.color)
      hg.addColorStop(1, st.colorDark)
      ctx.fillStyle = hg
      ctx.beginPath()
      ctx.arc(head.x, head.y, hr, 0, Math.PI * 2)
      ctx.fill()
      // eyes + tongue toward player
      const hang = Math.atan2(s.player.y - head.y, s.player.x - head.x)
      const pang = hang + Math.PI / 2
      // tongue
      ctx.strokeStyle = "#e23b3b"
      ctx.lineWidth = 2
      const tongueLen = hr + 6 + Math.sin(now / 100) * 3
      const tx = head.x + Math.cos(hang) * tongueLen
      const ty = head.y + Math.sin(hang) * tongueLen
      ctx.beginPath()
      ctx.moveTo(head.x + Math.cos(hang) * hr, head.y + Math.sin(hang) * hr)
      ctx.lineTo(tx, ty)
      ctx.stroke()
      // eyes
      for (const sgn of [-1, 1]) {
        const eyeX = head.x + Math.cos(hang) * 3 + Math.cos(pang) * 4 * sgn
        const eyeY = head.y + Math.sin(hang) * 3 + Math.sin(pang) * 4 * sgn
        ctx.fillStyle = "#fbe9a0"
        ctx.beginPath()
        ctx.arc(eyeX, eyeY, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = "#1a1208"
        ctx.beginPath()
        ctx.arc(eyeX + Math.cos(hang) * 1, eyeY + Math.sin(hang) * 1, 1.5, 0, Math.PI * 2)
        ctx.fill()
      }
      // health bar above head
      const barW = 34
      const barH = 5
      const bx = head.x - barW / 2
      const by = head.y - hr - 12
      ctx.fillStyle = "rgba(0,0,0,0.55)"
      ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2)
      const ratio = Math.max(0, snake.hp / snake.maxHp)
      ctx.fillStyle = ratio > 0.5 ? "#7fe07f" : ratio > 0.25 ? "#ffd24a" : "#e23b3b"
      ctx.fillRect(bx, by, barW * ratio, barH)
    }

    // player squirrel
    const p = s.player
    ctx.save()
    ctx.translate(p.x, p.y)
    // ground shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)"
    ctx.beginPath()
    ctx.ellipse(0, p.r - 2, p.r * 0.9, 5, 0, 0, Math.PI * 2)
    ctx.fill()
    const ang = Math.atan2(p.facing.y, p.facing.x)
    ctx.rotate(ang)
    const bob = Math.sin(p.walk) * 1.5
    // tail (behind, animated sway)
    const sway = Math.sin(p.walk * 0.7) * 0.3
    ctx.save()
    ctx.translate(-p.r - 2, 0)
    ctx.rotate(sway)
    const tg = ctx.createLinearGradient(-16, 0, 4, 0)
    tg.addColorStop(0, "#8a5424")
    tg.addColorStop(1, "#b9772f")
    ctx.fillStyle = tg
    ctx.beginPath()
    ctx.ellipse(-8, 0, 13, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#a86b34"
    ctx.beginPath()
    ctx.ellipse(-8, 0, 8, 5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    // body
    const bg2 = ctx.createRadialGradient(-4, -4 + bob, 2, 0, bob, p.r)
    bg2.addColorStop(0, "#cf8a3f")
    bg2.addColorStop(1, "#a8631f")
    ctx.fillStyle = bg2
    ctx.beginPath()
    ctx.arc(0, bob, p.r, 0, Math.PI * 2)
    ctx.fill()
    // belly
    ctx.fillStyle = "#eccd92"
    ctx.beginPath()
    ctx.ellipse(3, 3 + bob, p.r * 0.5, p.r * 0.6, 0, 0, Math.PI * 2)
    ctx.fill()
    // ears
    ctx.fillStyle = "#a86b34"
    for (const sgn of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(-3, sgn * 9 + bob, 4.5, 0, Math.PI * 2)
      ctx.fill()
    }
    // eye (facing forward = +x)
    ctx.fillStyle = "#1a1208"
    ctx.beginPath()
    ctx.arc(7, -4 + bob, 2.6, 0, Math.PI * 2)
    ctx.arc(7, 4 + bob, 2.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#fff"
    ctx.beginPath()
    ctx.arc(8, -4.5 + bob, 0.9, 0, Math.PI * 2)
    ctx.arc(8, 3.5 + bob, 0.9, 0, Math.PI * 2)
    ctx.fill()
    // nose
    ctx.fillStyle = "#5a3416"
    ctx.beginPath()
    ctx.arc(p.r - 2, bob, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // power aura
    if (s.power.id === "fire" || s.power.id === "speed") {
      const c = s.power.id === "fire" ? "#ff7a1a" : "#4a6cf7"
      ctx.strokeStyle = c
      ctx.lineWidth = 2.5
      ctx.globalAlpha = 0.4 + Math.sin(now / 140) * 0.25
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    // stacked shield rings
    for (let i = 0; i < s.shields; i++) {
      ctx.strokeStyle = "#e8c98f"
      ctx.lineWidth = 2.5
      ctx.globalAlpha = 0.45 + Math.sin(now / 150 + i) * 0.25
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r + 9 + i * 5, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // particles
    for (const pt of s.particles) {
      ctx.globalAlpha = Math.max(0, pt.life)
      ctx.fillStyle = pt.color
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, pt.size * pt.life, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // floaters
    ctx.textAlign = "center"
    ctx.font = "bold 14px ui-sans-serif, system-ui"
    for (const fl of s.floaters) {
      ctx.globalAlpha = Math.max(0, fl.life)
      ctx.fillStyle = fl.color
      ctx.strokeStyle = "rgba(0,0,0,0.5)"
      ctx.lineWidth = 3
      ctx.strokeText(fl.text, fl.x, fl.y)
      ctx.fillText(fl.text, fl.x, fl.y)
    }
    ctx.globalAlpha = 1

    // fusion transition flash
    if (s.fusionFlash > 0.02) {
      ctx.globalAlpha = s.fusionFlash * 0.6
      ctx.fillStyle = biome.accent
      ctx.fillRect(-10, -10, WORLD.w + 20, WORLD.h + 20)
      ctx.globalAlpha = 1
    }

    ctx.restore()
  }

  const powerColor: Record<PowerId, string> = {
    none: "var(--muted-foreground)",
    seeds: "#c9a23a",
    fire: "#ff7a1a",
    speed: "#4a6cf7",
    shield: "#e8c98f",
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-[900px] overflow-hidden rounded-xl border-2 border-primary/30 shadow-xl">
        <canvas
          ref={canvasRef}
          width={WORLD.w}
          height={WORLD.h}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          className="block w-full cursor-crosshair touch-none bg-[#33602e]"
          style={{ aspectRatio: `${WORLD.w}/${WORLD.h}` }}
        />

        {/* HUD overlay */}
        {status === "playing" && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            <div className="rounded-lg bg-black/45 px-3 py-2 text-sm text-white backdrop-blur-sm">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-mono font-bold">HP</span>
                <div className="h-2.5 w-28 overflow-hidden rounded-full bg-white/25">
                  <div
                    className="h-full rounded-full transition-[width] duration-150"
                    style={{ width: `${hud.hp}%`, background: hud.hp > 40 ? "#5fd35f" : "#e23b3b" }}
                  />
                </div>
                <span className="font-mono text-xs tabular-nums">{hud.hp}</span>
              </div>
              <div className="flex items-center gap-3 font-mono text-xs">
                <span>
                  Score <span className="font-bold text-[#ffd966]">{hud.score}</span>
                </span>
                <span className="flex items-center gap-1">
                  Shields{" "}
                  <span className="font-bold text-[#e8c98f]">
                    {hud.shields}/{MAX_SHIELDS}
                  </span>
                </span>
              </div>
            </div>

            {/* Center: biome + active event */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="rounded-full px-3 py-1 text-center text-xs font-bold text-white backdrop-blur-sm"
                style={{ background: "rgba(0,0,0,0.45)", boxShadow: `0 0 0 1.5px ${BIOMES[hud.biomeIndex].accent}` }}
              >
                <span style={{ color: BIOMES[hud.biomeIndex].accent }}>
                  {hud.levelName} - {BIOMES[hud.biomeIndex].name}
                </span>
              </div>
              <div className="rounded-full bg-black/45 px-3 py-1 text-center text-[11px] font-medium text-white/90 backdrop-blur-sm">
                {hud.objective}
              </div>
              {hud.eventName && (
                <div
                  className="animate-pulse rounded-full px-3 py-1 text-center text-xs font-bold backdrop-blur-sm"
                  style={{ background: "rgba(0,0,0,0.55)", color: hud.eventColor, boxShadow: `0 0 0 1.5px ${hud.eventColor}` }}
                >
                  {hud.eventName} {hud.eventLeft > 0 && <span className="font-mono opacity-80">{hud.eventLeft}s</span>}
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="rounded-lg bg-black/45 px-3 py-2 text-right text-xs text-white backdrop-blur-sm">
                <div className="font-bold uppercase tracking-wide text-[#ff9a6b]">{SNAKE_STAGES[hud.topStage].name}</div>
                <div className="font-mono">
                  {hud.snakeCount} snake{hud.snakeCount > 1 ? "s" : ""} · Evo {hud.topStage + 1}/{SNAKE_STAGES.length}
                </div>
              </div>
              {hud.bossMaxHp > 0 && (
                <div className="rounded-lg bg-black/55 px-3 py-2 text-right text-xs font-bold text-white backdrop-blur-sm">
                  <div className="mb-1 uppercase tracking-wide text-[#ff6b6b]">Boss HP</div>
                  <div className="h-2.5 w-36 overflow-hidden rounded-full bg-white/20">
                    <div
                      className="h-full rounded-full bg-[#e23b3b] transition-[width] duration-150"
                      style={{ width: `${(hud.bossHp / hud.bossMaxHp) * 100}%` }}
                    />
                  </div>
                  <div className="mt-1 font-mono">
                    {hud.bossHp}/{hud.bossMaxHp}
                  </div>
                </div>
              )}
              {hud.power !== "none" && (
                <div
                  className="rounded-lg bg-black/55 px-3 py-2 text-right text-xs font-bold text-white backdrop-blur-sm"
                  style={{ boxShadow: `0 0 0 2px ${powerColor[hud.power]}` }}
                >
                  <span style={{ color: powerColor[hud.power] }}>{hud.powerName}</span>
                  {hud.powerLeft > 0 && <span className="ml-1 font-mono opacity-80">{hud.powerLeft}s</span>}
                  {(hud.power === "seeds" || hud.power === "fire") && (
                    <div className="mt-0.5 font-normal opacity-80">Auto-firing</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Menu */}
        {status === "menu" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/55 p-6 text-center backdrop-blur-sm">
            <h1 className="text-balance text-4xl font-extrabold text-white drop-shadow-lg md:text-5xl">
              Squirrel Fusion
            </h1>
            <p className="max-w-md text-pretty text-sm text-white/80 md:text-base">
              Eat foods to fuse powers and survive snakes that evolve, serpentine, and split. As your score climbs the
              world <span className="font-bold text-white">fuses</span> into new biomes that reshape the rules — plus
              random events shake things up. Watch out: snakes eat food too.
            </p>
            <button
              onClick={start}
              className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground shadow-lg transition hover:scale-105 active:scale-95"
            >
              Start Game
            </button>
            <p className="text-xs text-white/60">Move: Click / WASD · Powers fire automatically</p>
          </div>
        )}

        {/* Death */}
        {status === "dead" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/65 p-6 text-center backdrop-blur-sm">
            <h2 className="text-4xl font-extrabold text-[#e23b3b] drop-shadow">Gobbled Up!</h2>
            <p className="text-white/85">
              The <span className="font-bold text-[#ff9a6b]">{SNAKE_STAGES[hud.topStage].name}</span> got you.
            </p>
            <p className="text-2xl font-bold text-white">
              Score <span className="text-[#ffd966]">{hud.score}</span>
            </p>
            <button
              onClick={start}
              className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground shadow-lg transition hover:scale-105 active:scale-95"
            >
              Play Again
            </button>
          </div>
        )}
        {status === "won" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/65 p-6 text-center backdrop-blur-sm">
            <h2 className="text-4xl font-extrabold text-[#ffd966] drop-shadow">Victory!</h2>
            <p className="text-white/85">Ai invins Viper King si ai terminat toate cele 3 etape.</p>
            <p className="text-2xl font-bold text-white">
              Final Score <span className="text-[#ffd966]">{hud.score}</span>
            </p>
            <button
              onClick={start}
              className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground shadow-lg transition hover:scale-105 active:scale-95"
            >
              Play Again
            </button>
          </div>
        )}
      </div>

      {/* Food legend */}
      <div className="grid w-full max-w-[900px] grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {FOODS.map((f) => (
          <div key={f.id} className="flex items-start gap-2 rounded-lg border border-border bg-card p-2.5">
            <span className="text-2xl leading-none">{f.emoji}</span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-card-foreground">{f.powerName}</div>
              <div className="text-pretty text-xs text-muted-foreground">{f.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
