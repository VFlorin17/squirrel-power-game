"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { FOODS, SNAKE_STAGES, type FoodType, type PowerId } from "@/lib/game-config"

const WORLD = { w: 900, h: 600 }

interface Vec {
  x: number
  y: number
}

interface FoodItem extends Vec {
  type: FoodType
  id: number
}

interface Projectile extends Vec {
  vx: number
  vy: number
  kind: "seed" | "fire"
  life: number
  id: number
}

interface SnakeSeg extends Vec {}

interface GameState {
  player: Vec & { vx: number; vy: number; r: number; hp: number; facing: Vec }
  power: { id: PowerId; until: number; name: string }
  shield: boolean
  foods: FoodItem[]
  projectiles: Projectile[]
  snake: { segs: SnakeSeg[]; stage: number; kills: number }
  score: number
  particles: { x: number; y: number; vx: number; vy: number; life: number; color: string }[]
}

type Status = "menu" | "playing" | "dead"

let idCounter = 1
const nextId = () => idCounter++

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function spawnFood(): FoodItem {
  const type = FOODS[Math.floor(Math.random() * FOODS.length)]
  return {
    type,
    id: nextId(),
    x: rand(40, WORLD.w - 40),
    y: rand(40, WORLD.h - 40),
  }
}

export default function SquirrelGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<GameState | null>(null)
  const keysRef = useRef<Record<string, boolean>>({})
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const lastShotRef = useRef<number>(0)

  const [status, setStatus] = useState<Status>("menu")
  const [hud, setHud] = useState({ hp: 100, score: 0, power: "none" as PowerId, powerName: "", powerLeft: 0, stage: 0, kills: 0 })

  const createState = useCallback((): GameState => {
    return {
      player: { x: WORLD.w / 2, y: WORLD.h / 2, vx: 0, vy: 0, r: 16, hp: 100, facing: { x: 1, y: 0 } },
      power: { id: "none", until: 0, name: "" },
      shield: false,
      foods: Array.from({ length: 5 }, spawnFood),
      projectiles: [],
      snake: {
        stage: 0,
        kills: 0,
        segs: Array.from({ length: SNAKE_STAGES[0].segments }, (_, i) => ({ x: 60, y: 60 + i * 4 })),
      },
      score: 0,
      particles: [],
    }
  }, [])

  const start = useCallback(() => {
    stateRef.current = createState()
    lastTimeRef.current = performance.now()
    setStatus("playing")
  }, [createState])

  const burst = (s: GameState, x: number, y: number, color: string, n = 12) => {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2)
      const sp = rand(1, 4)
      s.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color })
    }
  }

  const shoot = useCallback(() => {
    const s = stateRef.current
    if (!s || status !== "playing") return
    const now = performance.now()
    if (now - lastShotRef.current < 350) return
    const p = s.player
    const f = p.facing
    if (s.power.id === "seeds") {
      lastShotRef.current = now
      for (let i = 0; i < 10; i++) {
        const spread = (i - 4.5) * 0.12
        const baseAng = Math.atan2(f.y, f.x)
        const ang = baseAng + spread
        s.projectiles.push({
          x: p.x,
          y: p.y,
          vx: Math.cos(ang) * 7,
          vy: Math.sin(ang) * 7,
          kind: "seed",
          life: 70,
          id: nextId(),
        })
      }
      burst(s, p.x, p.y, "#c9a23a", 6)
    } else if (s.power.id === "fire") {
      lastShotRef.current = now
      const baseAng = Math.atan2(f.y, f.x)
      for (let i = 0; i < 3; i++) {
        const ang = baseAng + (i - 1) * 0.18
        s.projectiles.push({
          x: p.x,
          y: p.y,
          vx: Math.cos(ang) * 6,
          vy: Math.sin(ang) * 6,
          kind: "fire",
          life: 60,
          id: nextId(),
        })
      }
      burst(s, p.x, p.y, "#ff7a1a", 8)
    }
  }, [status])

  // input
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      keysRef.current[k] = true
      if (k === " " || k === "spacebar") {
        e.preventDefault()
        shoot()
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

      // --- player movement ---
      const k = keysRef.current
      const p = s.player
      let ax = 0
      let ay = 0
      if (k["arrowup"] || k["w"]) ay -= 1
      if (k["arrowdown"] || k["s"]) ay += 1
      if (k["arrowleft"] || k["a"]) ax -= 1
      if (k["arrowright"] || k["d"]) ax += 1
      const speedBoost = s.power.id === "speed" ? 1.9 : 1
      const accel = 0.9 * speedBoost
      if (ax || ay) {
        const len = Math.hypot(ax, ay)
        ax /= len
        ay /= len
        p.vx += ax * accel
        p.vy += ay * accel
        p.facing = { x: ax, y: ay }
      }
      const maxSpd = 4.5 * speedBoost
      p.vx *= 0.86
      p.vy *= 0.86
      const sp = Math.hypot(p.vx, p.vy)
      if (sp > maxSpd) {
        p.vx = (p.vx / sp) * maxSpd
        p.vy = (p.vy / sp) * maxSpd
      }
      p.x = Math.max(p.r, Math.min(WORLD.w - p.r, p.x + p.vx * dt))
      p.y = Math.max(p.r, Math.min(WORLD.h - p.r, p.y + p.vy * dt))

      // --- power expiry ---
      if (s.power.id !== "none" && s.power.id !== "shield" && now > s.power.until) {
        s.power = { id: "none", until: 0, name: "" }
      }
      if (s.power.id === "shield" && now > s.power.until && s.shield) {
        // shield stays until hit, but timed buff lapses
      }

      // --- food eat ---
      for (let i = s.foods.length - 1; i >= 0; i--) {
        const f = s.foods[i]
        if (Math.hypot(f.x - p.x, f.y - p.y) < p.r + 12) {
          p.hp = Math.min(100, p.hp + f.type.heal)
          s.score += 10
          burst(s, f.x, f.y, f.type.color, 14)
          if (f.type.power === "shield") {
            s.shield = true
            s.power = { id: "shield", until: now + f.type.duration, name: f.type.powerName }
          } else if (f.type.power !== "none") {
            s.power = { id: f.type.power, until: now + f.type.duration, name: f.type.powerName }
          }
          s.foods.splice(i, 1)
        }
      }
      while (s.foods.length < 5) s.foods.push(spawnFood())

      // --- projectiles ---
      for (let i = s.projectiles.length - 1; i >= 0; i--) {
        const pr = s.projectiles[i]
        pr.x += pr.vx * dt
        pr.y += pr.vy * dt
        pr.life -= dt
        if (pr.life <= 0 || pr.x < 0 || pr.x > WORLD.w || pr.y < 0 || pr.y > WORLD.h) {
          s.projectiles.splice(i, 1)
        }
      }

      // --- snake AI (head chases player, body follows) ---
      const stage = SNAKE_STAGES[s.snake.stage]
      const segs = s.snake.segs
      const head = segs[0]
      const dx = p.x - head.x
      const dy = p.y - head.y
      const d = Math.hypot(dx, dy) || 1
      head.x += (dx / d) * stage.speed * dt
      head.y += (dy / d) * stage.speed * dt
      const follow = stage.segSize * 0.75
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

      // projectiles hit snake head
      for (let i = s.projectiles.length - 1; i >= 0; i--) {
        const pr = s.projectiles[i]
        if (Math.hypot(pr.x - head.x, pr.y - head.y) < stage.segSize + 4) {
          s.projectiles.splice(i, 1)
          burst(s, pr.x, pr.y, pr.kind === "fire" ? "#ff7a1a" : "#c9a23a", 10)
          s.snake.kills += pr.kind === "fire" ? 3 : 1
          s.score += 5
          // knock head back
          head.x -= (dx / d) * 30
          head.y -= (dy / d) * 30
          // evolve snake every threshold
          const threshold = (s.snake.stage + 1) * 12
          if (s.snake.kills >= threshold && s.snake.stage < SNAKE_STAGES.length - 1) {
            s.snake.stage++
            const ns = SNAKE_STAGES[s.snake.stage]
            while (segs.length < ns.segments) {
              const tail = segs[segs.length - 1]
              segs.push({ x: tail.x, y: tail.y })
            }
            burst(s, head.x, head.y, ns.color, 30)
          }
        }
      }

      // snake head hits player
      if (Math.hypot(head.x - p.x, head.y - p.y) < stage.segSize + p.r - 4) {
        if (s.shield) {
          s.shield = false
          if (s.power.id === "shield") s.power = { id: "none", until: 0, name: "" }
          burst(s, p.x, p.y, "#b58a4a", 20)
          head.x -= (dx / d) * 60
          head.y -= (dy / d) * 60
        } else {
          p.hp -= 0.8 * dt * (1 + s.snake.stage * 0.25)
          burst(s, p.x, p.y, "#e23b3b", 2)
        }
      }

      // --- particles ---
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const pt = s.particles[i]
        pt.x += pt.vx * dt
        pt.y += pt.vy * dt
        pt.vx *= 0.92
        pt.vy *= 0.92
        pt.life -= 0.03 * dt
        if (pt.life <= 0) s.particles.splice(i, 1)
      }

      // death
      if (p.hp <= 0) {
        p.hp = 0
        setStatus("dead")
        setHud((h) => ({ ...h, hp: 0 }))
        return
      }

      // --- render ---
      draw(ctx, s, now)

      // HUD throttled
      setHud({
        hp: Math.round(p.hp),
        score: s.score,
        power: s.power.id,
        powerName: s.power.name,
        powerLeft: s.power.id !== "none" && s.power.id !== "shield" ? Math.max(0, Math.ceil((s.power.until - now) / 1000)) : 0,
        stage: s.snake.stage,
        kills: s.snake.kills,
      })

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [status])

  const draw = (ctx: CanvasRenderingContext2D, s: GameState, now: number) => {
    // background grass
    ctx.fillStyle = "#3a6b35"
    ctx.fillRect(0, 0, WORLD.w, WORLD.h)
    // subtle grid tufts
    ctx.fillStyle = "rgba(255,255,255,0.04)"
    for (let gx = 0; gx < WORLD.w; gx += 40) {
      for (let gy = 0; gy < WORLD.h; gy += 40) {
        ctx.fillRect(gx, gy, 2, 6)
      }
    }

    // foods
    for (const f of s.foods) {
      ctx.font = "24px serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.shadowColor = "rgba(0,0,0,0.4)"
      ctx.shadowBlur = 6
      ctx.fillText(f.type.emoji, f.x, f.y)
      ctx.shadowBlur = 0
    }

    // projectiles
    for (const pr of s.projectiles) {
      if (pr.kind === "fire") {
        ctx.fillStyle = "#ff7a1a"
        ctx.shadowColor = "#ff4500"
        ctx.shadowBlur = 12
        ctx.beginPath()
        ctx.arc(pr.x, pr.y, 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      } else {
        ctx.fillStyle = "#e8d18a"
        ctx.beginPath()
        ctx.ellipse(pr.x, pr.y, 4, 2.5, Math.atan2(pr.vy, pr.vx), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // snake
    const stage = SNAKE_STAGES[s.snake.stage]
    const segs = s.snake.segs
    for (let i = segs.length - 1; i >= 0; i--) {
      const seg = segs[i]
      const t = 1 - i / segs.length
      ctx.fillStyle = stage.color
      ctx.globalAlpha = 0.65 + t * 0.35
      ctx.beginPath()
      ctx.arc(seg.x, seg.y, stage.segSize * (0.6 + t * 0.4), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    // head + eyes
    const head = segs[0]
    ctx.fillStyle = stage.color
    ctx.beginPath()
    ctx.arc(head.x, head.y, stage.segSize + 2, 0, Math.PI * 2)
    ctx.fill()
    const hang = Math.atan2(s.player.y - head.y, s.player.x - head.x)
    ctx.fillStyle = "#fff"
    const ex = Math.cos(hang) * 4
    const ey = Math.sin(hang) * 4
    const pang = hang + Math.PI / 2
    for (const sgn of [-1, 1]) {
      const eyeX = head.x + ex + Math.cos(pang) * 4 * sgn
      const eyeY = head.y + ey + Math.sin(pang) * 4 * sgn
      ctx.beginPath()
      ctx.arc(eyeX, eyeY, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // player squirrel
    const p = s.player
    ctx.save()
    ctx.translate(p.x, p.y)
    // tail
    ctx.fillStyle = "#a86b34"
    const tailAng = Math.atan2(-p.vy, -p.vx) || Math.PI
    ctx.beginPath()
    ctx.ellipse(Math.cos(tailAng) * 14, Math.sin(tailAng) * 14, 12, 8, tailAng, 0, Math.PI * 2)
    ctx.fill()
    // body
    ctx.fillStyle = "#b9772f"
    ctx.beginPath()
    ctx.arc(0, 0, p.r, 0, Math.PI * 2)
    ctx.fill()
    // belly
    ctx.fillStyle = "#e8c98f"
    ctx.beginPath()
    ctx.arc(0, 4, p.r * 0.55, 0, Math.PI * 2)
    ctx.fill()
    // ears
    ctx.fillStyle = "#a86b34"
    ctx.beginPath()
    ctx.arc(-7, -p.r + 2, 4, 0, Math.PI * 2)
    ctx.arc(7, -p.r + 2, 4, 0, Math.PI * 2)
    ctx.fill()
    // eyes
    ctx.fillStyle = "#1a1208"
    ctx.beginPath()
    ctx.arc(-5, -3, 2.5, 0, Math.PI * 2)
    ctx.arc(5, -3, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // shield ring
    if (s.shield) {
      ctx.strokeStyle = "#b58a4a"
      ctx.lineWidth = 3
      ctx.globalAlpha = 0.6 + Math.sin(now / 150) * 0.3
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r + 8, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    // power aura
    if (s.power.id === "fire") {
      ctx.strokeStyle = "#ff7a1a"
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    } else if (s.power.id === "speed") {
      ctx.strokeStyle = "#4a6cf7"
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // particles
    for (const pt of s.particles) {
      ctx.globalAlpha = Math.max(0, pt.life)
      ctx.fillStyle = pt.color
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  const powerColor: Record<PowerId, string> = {
    none: "var(--muted-foreground)",
    seeds: "#c9a23a",
    fire: "#ff7a1a",
    speed: "#4a6cf7",
    shield: "#b58a4a",
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-[900px] overflow-hidden rounded-xl border-2 border-primary/30 shadow-xl">
        <canvas
          ref={canvasRef}
          width={WORLD.w}
          height={WORLD.h}
          className="block w-full touch-none bg-[#3a6b35]"
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
                    style={{
                      width: `${hud.hp}%`,
                      background: hud.hp > 40 ? "#5fd35f" : "#e23b3b",
                    }}
                  />
                </div>
                <span className="font-mono text-xs tabular-nums">{hud.hp}</span>
              </div>
              <div className="font-mono text-xs">
                Score <span className="font-bold text-[#ffd966]">{hud.score}</span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="rounded-lg bg-black/45 px-3 py-2 text-right text-xs text-white backdrop-blur-sm">
                <div className="font-bold uppercase tracking-wide text-[#ff9a6b]">{SNAKE_STAGES[hud.stage].name}</div>
                <div className="font-mono">
                  Evolution {hud.stage + 1}/{SNAKE_STAGES.length}
                </div>
              </div>
              {hud.power !== "none" && (
                <div
                  className="rounded-lg bg-black/55 px-3 py-2 text-right text-xs font-bold text-white backdrop-blur-sm"
                  style={{ boxShadow: `0 0 0 2px ${powerColor[hud.power]}` }}
                >
                  <span style={{ color: powerColor[hud.power] }}>{hud.powerName}</span>
                  {hud.powerLeft > 0 && <span className="ml-1 font-mono opacity-80">{hud.powerLeft}s</span>}
                  {(hud.power === "seeds" || hud.power === "fire") && (
                    <div className="mt-0.5 font-normal opacity-80">SPACE to fire</div>
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
              Eat foods to fuse new powers. Spit seeds, breathe fire, dash, or shield up — and survive the snake that
              evolves the longer you live.
            </p>
            <button
              onClick={start}
              className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground shadow-lg transition hover:scale-105 active:scale-95"
            >
              Start Game
            </button>
            <p className="text-xs text-white/60">Move: WASD / Arrows · Fire: SPACE</p>
          </div>
        )}

        {/* Death */}
        {status === "dead" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/65 p-6 text-center backdrop-blur-sm">
            <h2 className="text-4xl font-extrabold text-[#e23b3b] drop-shadow">Gobbled Up!</h2>
            <p className="text-white/85">
              The <span className="font-bold text-[#ff9a6b]">{SNAKE_STAGES[hud.stage].name}</span> got you.
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
