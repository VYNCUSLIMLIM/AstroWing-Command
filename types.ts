export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
  PAUSED = 'PAUSED',
  SHOP = 'SHOP'
}

export interface Position {
  x: number;
  y: number;
}

export interface Velocity {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  pos: Position;
  vel: Velocity;
  width: number;
  height: number;
  color: string;
  active: boolean;
}

export interface Player extends Entity {
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  fireRate: number;
  lastFired: number;
  weaponLevel: number;
  speedMultiplier: number; // For speed powerup
  invulnerableUntil: number; // Timestamp for invulnerability end
}

export interface Enemy extends Entity {
  hp: number;
  type: 'drone' | 'fighter' | 'boss' | 'seeker' | 'bomber' | 'minelayer' | 'guardian';
  scoreValue: number;
  pattern: number; 
  lastFired?: number; // For shooting enemies
  shield?: number; // For guardian enemies
  maxShield?: number;
}

export interface Projectile extends Entity {
  damage: number;
  owner: 'player' | 'enemy';
  tracking?: boolean; // For homing missiles
  isMine?: boolean; // For stationary mines
}

export interface Particle extends Entity {
  life: number;
  maxLife: number;
  alpha: number;
  scale?: number;
}

export interface PowerUp extends Entity {
  type: 'WEAPON' | 'SHIELD' | 'SPEED';
}

export interface GameStats {
  score: number;
  credits: number;
  wave: number;
  enemiesDestroyed: number;
  accuracy: number; // percentage
  shotsFired: number;
  shotsHit: number;
  timeSurvived: number; // seconds
  weaponLevel: number;
}

export interface MissionLog {
  id: string;
  sender: 'COMMAND' | 'SYSTEM' | 'AI';
  message: string;
  timestamp: number;
  priority: 'low' | 'normal' | 'high' | 'critical';
}
