export interface PrimaryButtonEffectState {
  hover: number;
  press: number;
  pointerX: number;
  pointerY: number;
  reducedMotion: boolean;
}

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

const EMBER_COUNT = 8;
const BORDER_RADIUS = 8;
const GOLD = "253, 199, 135";
const GOLD_BRIGHT = "253, 210, 159";
const ARCANE = "116, 212, 255";

function rgba(rgb: string, alpha: number): string {
  return `rgba(${rgb}, ${Math.min(1, Math.max(0, alpha))})`;
}

function traceRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/**
 * Glow, cursor highlight, embers, and click pulse for one primary button.
 * Embers are a fixed pool mutated in place. The highlight is a radial gradient,
 * so it falls off without a blur filter clipped to the canvas edge.
 */
export class PrimaryButtonEffect {
  private width = 0;
  private height = 0;
  private dpr = 1;
  private time = 0;
  private pulseT = -1;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly embers: Ember[];

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D is unavailable");
    }
    this.ctx = ctx;
    this.embers = Array.from({ length: EMBER_COUNT }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 1,
    }));
  }

  resize(cssWidth: number, cssHeight: number): void {
    const width = Math.max(cssWidth, 0);
    const height = Math.max(cssHeight, 0);
    const sizeChanged = width !== this.width || height !== this.height;
    this.width = width;
    this.height = height;
    if (width <= 0 || height <= 0) return;

    this.dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const bitmapWidth = Math.round(width * this.dpr);
    const bitmapHeight = Math.round(height * this.dpr);
    if (
      this.canvas.width !== bitmapWidth ||
      this.canvas.height !== bitmapHeight
    ) {
      this.canvas.width = bitmapWidth;
      this.canvas.height = bitmapHeight;
    }
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (sizeChanged) {
      for (const ember of this.embers) this.resetEmber(ember, true);
    }
  }

  triggerRelease(): void {
    this.pulseT = 0;
  }

  clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  update(state: PrimaryButtonEffectState, deltaSeconds: number): void {
    if (this.width <= 0 || this.height <= 0) return;
    this.time += deltaSeconds;

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    traceRoundRect(ctx, 0, 0, this.width, this.height, BORDER_RADIUS);
    ctx.clip();

    const activity = Math.max(state.hover, state.press);
    this.drawGlow(activity, state);
    this.drawSweep(activity, state);
    this.drawParticles(activity, state, deltaSeconds);
    this.drawPulse(state, deltaSeconds);

    ctx.restore();
  }

  private drawGlow(activity: number, state: PrimaryButtonEffectState): void {
    const ctx = this.ctx;
    const ambient = state.reducedMotion
      ? 0.5
      : Math.sin(this.time * 2.1) * 0.5 + 0.5;
    const alpha = Math.min(1, 0.16 + ambient * 0.08 + activity * 0.55);
    const color = state.hover > 0.5 ? GOLD_BRIGHT : GOLD;

    ctx.lineJoin = "round";
    if (activity > 0.03) {
      ctx.lineWidth = 6;
      ctx.strokeStyle = rgba(color, activity * 0.12);
      this.strokeInset(3, BORDER_RADIUS);
    }

    ctx.lineWidth = 1.5 + activity * 1.5;
    ctx.strokeStyle = rgba(color, alpha);
    this.strokeInset(ctx.lineWidth / 2 + 0.5, BORDER_RADIUS);
  }

  private drawSweep(activity: number, state: PrimaryButtonEffectState): void {
    if (state.reducedMotion || activity <= 0.03) return;

    const ctx = this.ctx;
    const cx = (state.pointerX * 0.5 + 0.5) * this.width;
    const cy = (state.pointerY * 0.5 + 0.5) * this.height;
    const radius = this.height * 1.1;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, rgba(ARCANE, activity * 0.35));
    gradient.addColorStop(1, rgba(ARCANE, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawParticles(
    activity: number,
    state: PrimaryButtonEffectState,
    deltaSeconds: number,
  ): void {
    if (state.reducedMotion || activity <= 0.05) return;

    const ctx = this.ctx;
    for (const ember of this.embers) {
      ember.life += deltaSeconds;
      if (ember.life > ember.maxLife) {
        this.resetEmber(ember, false);
        continue;
      }
      ember.x += ember.vx * deltaSeconds;
      ember.y += ember.vy * deltaSeconds;

      const lifeT = ember.life / ember.maxLife;
      const alpha = (1 - lifeT) * activity * 0.7;
      if (alpha <= 0.015 || ember.y < -8 || ember.y > this.height + 8) continue;

      ctx.beginPath();
      ctx.fillStyle = rgba(GOLD_BRIGHT, alpha);
      ctx.arc(ember.x, ember.y, ember.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawPulse(
    state: PrimaryButtonEffectState,
    deltaSeconds: number,
  ): void {
    if (this.pulseT < 0) return;
    if (state.reducedMotion) {
      this.pulseT = -1;
      return;
    }

    this.pulseT += deltaSeconds / 0.45;
    if (this.pulseT >= 1) {
      this.pulseT = -1;
      return;
    }

    const expand = this.pulseT * 8;
    const ctx = this.ctx;
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(GOLD_BRIGHT, (1 - this.pulseT) * 0.6);
    this.strokeInset(1 - expand, BORDER_RADIUS + expand);
  }

  private strokeInset(inset: number, radius: number): void {
    const width = this.width - inset * 2;
    const height = this.height - inset * 2;
    if (width < 2 || height < 2) return;
    traceRoundRect(this.ctx, inset, inset, width, height, radius);
    this.ctx.stroke();
  }

  private resetEmber(ember: Ember, initial: boolean): void {
    const width = this.width || 120;
    const height = this.height || 40;
    ember.x = Math.random() * width;
    ember.y = initial ? Math.random() * height : height + 4;
    ember.vx = (Math.random() - 0.5) * 4;
    ember.vy = -(6 + Math.random() * 10);
    ember.life = initial ? Math.random() : 0;
    ember.maxLife = 1.4 + Math.random() * 0.8;
    ember.size = 0.6 + Math.random() * 1.2;
  }
}
