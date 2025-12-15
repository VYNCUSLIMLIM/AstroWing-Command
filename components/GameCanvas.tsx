import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { GameState, Entity, Player, Enemy, Projectile, Particle, GameStats, PowerUp } from '../types';

interface GameCanvasProps {
  gameState: GameState;
  setGameState: (state: GameState) => void;
  onStatsUpdate: (stats: GameStats) => void;
  onEvent: (event: string) => void;
}

export interface GameCanvasHandle {
  purchaseUpgrade: (type: 'WEAPON' | 'REPAIR' | 'SHIELD') => boolean;
}

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 800;
const ENEMY_SPAWN_RATE = 1000; // ms

export const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(({ 
  gameState, 
  setGameState, 
  onStatsUpdate,
  onEvent
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  
  // Game Entities Ref (Mutable state for performance)
  const gameRef = useRef<{
    player: Player;
    enemies: Enemy[];
    projectiles: Projectile[];
    particles: Particle[];
    powerups: PowerUp[];
    stats: GameStats;
    keys: { [key: string]: boolean };
    mousePos: { x: number; y: number };
    shake: number;
  }>({
    player: {
      id: 'p1', pos: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 100 }, vel: { x: 0, y: 0 },
      width: 40, height: 40, color: '#0ea5e9', active: true,
      hp: 100, maxHp: 100, shield: 50, maxShield: 50, fireRate: 150, lastFired: 0,
      weaponLevel: 1, speedMultiplier: 1, invulnerableUntil: 0
    },
    enemies: [],
    projectiles: [],
    particles: [],
    powerups: [],
    stats: { score: 0, credits: 0, wave: 1, enemiesDestroyed: 0, accuracy: 0, shotsFired: 0, shotsHit: 0, timeSurvived: 0, weaponLevel: 1 },
    keys: {},
    mousePos: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 100 },
    shake: 0
  });

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    purchaseUpgrade: (type: 'WEAPON' | 'REPAIR' | 'SHIELD') => {
      const state = gameRef.current;
      
      if (type === 'REPAIR') {
        if (state.stats.credits >= 1000 && state.player.hp < state.player.maxHp) {
          state.stats.credits -= 1000;
          state.player.hp = Math.min(state.player.hp + 50, state.player.maxHp);
          onEvent("REPAIR_COMPLETE");
          onStatsUpdate({...state.stats});
          return true;
        }
      } else if (type === 'WEAPON') {
        const cost = state.player.weaponLevel * 2500;
        if (state.stats.credits >= cost && state.player.weaponLevel < 4) {
          state.stats.credits -= cost;
          state.player.weaponLevel++;
          state.stats.weaponLevel = state.player.weaponLevel;
          onEvent("WEAPON_UPGRADED");
          onStatsUpdate({...state.stats});
          return true;
        }
      }
      return false;
    }
  }));

  // Reset Game
  const resetGame = useCallback(() => {
    const now = performance.now();
    gameRef.current.player = {
      id: 'p1', pos: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 100 }, vel: { x: 0, y: 0 },
      width: 40, height: 40, color: '#0ea5e9', active: true,
      hp: 100, maxHp: 100, shield: 50, maxShield: 50, fireRate: 150, lastFired: 0,
      weaponLevel: 1, speedMultiplier: 1, invulnerableUntil: now + 3000 // 3 seconds invulnerability
    };
    gameRef.current.enemies = [];
    gameRef.current.projectiles = [];
    gameRef.current.particles = [];
    gameRef.current.powerups = [];
    gameRef.current.stats = { score: 0, credits: 0, wave: 1, enemiesDestroyed: 0, accuracy: 0, shotsFired: 0, shotsHit: 0, timeSurvived: 0, weaponLevel: 1 };
    gameRef.current.shake = 0;
    lastTimeRef.current = now;
  }, []);

  useEffect(() => {
    // Only reset if starting a new game, not resuming
    if (gameState === GameState.PLAYING && gameRef.current.stats.timeSurvived === 0) {
      resetGame();
    }
  }, [gameState, resetGame]);

  // Input Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { gameRef.current.keys[e.code] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { gameRef.current.keys[e.code] = false; };
    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const scaleY = CANVAS_HEIGHT / rect.height;
      gameRef.current.mousePos = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Update Loop
  const update = useCallback((deltaTime: number, time: number) => {
    const state = gameRef.current;
    
    // Halt logic if paused
    if (gameState !== GameState.PLAYING) return;

    state.stats.timeSurvived += deltaTime / 1000;

    // Screen Shake Decay
    if (state.shake > 0) state.shake *= 0.9;
    if (state.shake < 0.5) state.shake = 0;

    // Player Movement (Mouse) - Responsive lerp
    const lerpFactor = 0.25 * state.player.speedMultiplier;
    state.player.pos.x += (state.mousePos.x - state.player.pos.x) * lerpFactor;
    state.player.pos.y += (state.mousePos.y - state.player.pos.y) * lerpFactor;

    // Clamp Player
    state.player.pos.x = Math.max(state.player.width/2, Math.min(CANVAS_WIDTH - state.player.width/2, state.player.pos.x));
    state.player.pos.y = Math.max(state.player.height/2, Math.min(CANVAS_HEIGHT - state.player.height/2, state.player.pos.y));

    // Shield Regen (Slowly)
    if (state.player.shield < state.player.maxShield && time % 100 < 16) {
        state.player.shield += 0.05;
    }

    // Auto Fire
    if (time - state.player.lastFired > state.player.fireRate) {
      const createProjectile = (offsetX: number, offsetY: number, vx: number, vy: number, damage: number = 25) => {
        state.projectiles.push({
          id: `b_${time}_${Math.random()}`,
          pos: { x: state.player.pos.x + offsetX, y: state.player.pos.y + offsetY },
          vel: { x: vx, y: vy },
          width: 4, height: 12, color: '#f0f9ff', active: true,
          damage: damage, owner: 'player'
        });
      };

      // Weapon Levels
      switch(state.player.weaponLevel) {
        case 1: // Basic
           createProjectile(0, -20, 0, -12);
           break;
        case 2: // Dual
           createProjectile(-10, -10, 0, -12);
           createProjectile(10, -10, 0, -12);
           break;
        case 3: // Spread
           createProjectile(0, -20, 0, -12);
           createProjectile(-15, -10, -2, -11);
           createProjectile(15, -10, 2, -11);
           break;
        case 4: // Omni
           createProjectile(-10, -10, 0, -14);
           createProjectile(10, -10, 0, -14);
           createProjectile(-20, 0, -3, -10);
           createProjectile(20, 0, 3, -10);
           break;
        default:
           createProjectile(0, -20, 0, -12);
      }

      state.player.lastFired = time;
      state.stats.shotsFired++;
    }

    // Spawn Enemies
    if (time - spawnTimerRef.current > Math.max(200, ENEMY_SPAWN_RATE - (state.stats.wave * 50))) {
      spawnTimerRef.current = time;
      const rand = Math.random();
      let type: Enemy['type'] = 'drone';
      let hp = 30 + (state.stats.wave * 5); // Scale HP
      let width = 30;
      let color = '#f97316';
      let scoreValue = 100;
      
      // Enemy Types
      if (rand > 0.95) { type = 'bomber'; hp = 150 + (state.stats.wave * 10); width = 50; color = '#4c1d95'; scoreValue = 300; }
      else if (rand > 0.8) { type = 'seeker'; hp = 50 + (state.stats.wave * 5); width = 35; color = '#db2777'; scoreValue = 150; }
      else if (rand > 0.6) { type = 'fighter'; hp = 60 + (state.stats.wave * 5); width = 40; color = '#ef4444'; scoreValue = 200; }

      state.enemies.push({
        id: `e_${time}`,
        pos: { x: Math.random() * (CANVAS_WIDTH - 40) + 20, y: -40 },
        vel: { x: (Math.random() - 0.5) * 2, y: Math.random() * 2 + 1 + (state.stats.wave * 0.1) },
        width, height: width, color,
        active: true, hp, type, scoreValue, 
        pattern: Math.floor(Math.random() * 3),
        lastFired: 0
      });
    }

    // Update Projectiles
    state.projectiles.forEach(p => {
      p.pos.x += p.vel.x;
      p.pos.y += p.vel.y;
      if (p.pos.y < -50 || p.pos.y > CANVAS_HEIGHT + 50) p.active = false;
    });

    // Update Powerups
    state.powerups.forEach(p => {
        p.pos.y += 2; // Drift down
        if (p.pos.y > CANVAS_HEIGHT + 50) p.active = false;

        // Collision with Player
        if (Math.abs(p.pos.x - state.player.pos.x) < (p.width + state.player.width)/2 &&
            Math.abs(p.pos.y - state.player.pos.y) < (p.height + state.player.height)/2) {
            p.active = false;
            if (p.type === 'WEAPON') {
                if (state.player.weaponLevel < 4) {
                    state.player.weaponLevel++;
                    state.stats.weaponLevel = state.player.weaponLevel;
                    onEvent("WEAPON_UPGRADED");
                } else {
                    state.stats.score += 500; // Bonus for max level
                }
            } else if (p.type === 'SHIELD') {
                state.player.shield = state.player.maxShield;
                state.player.hp = Math.min(state.player.hp + 25, state.player.maxHp);
                onEvent("REPAIR_COMPLETE");
            } else if (p.type === 'SPEED') {
                state.player.speedMultiplier = 1.5;
                setTimeout(() => { gameRef.current.player.speedMultiplier = 1; }, 5000);
            }
        }
    });

    // Enemy Damage Scaling
    const enemyDamage = 15 + (state.stats.wave * 2);

    // Update Enemies
    state.enemies.forEach(e => {
      e.pos.x += e.vel.x;
      e.pos.y += e.vel.y;
      
      // Movement Patterns
      if (e.type === 'seeker') {
          // Move towards player X
          if (e.pos.x < state.player.pos.x) e.pos.x += 1 + (state.stats.wave * 0.05);
          else e.pos.x -= 1 + (state.stats.wave * 0.05);
      } else if (e.pattern === 1) {
          e.pos.x += Math.sin(time * 0.005) * 2;
      }

      // Shooting Logic
      if ((e.type === 'fighter' || e.type === 'bomber') && e.pos.y > 0 && e.pos.y < CANVAS_HEIGHT - 100) {
          const fireInterval = e.type === 'bomber' ? 2000 : 1500;
          if (time - (e.lastFired || 0) > fireInterval) {
              e.lastFired = time;
              state.projectiles.push({
                  id: `ep_${time}_${e.id}`,
                  pos: { x: e.pos.x, y: e.pos.y + 20 },
                  vel: { x: 0, y: 6 },
                  width: 6, height: 12, color: '#ef4444', active: true,
                  damage: enemyDamage, owner: 'enemy'
              });
              if (e.type === 'bomber') {
                  // Bomber shoots spread
                  state.projectiles.push({
                      id: `ep_${time}_${e.id}_l`, pos: { x: e.pos.x, y: e.pos.y + 20 }, vel: { x: -2, y: 5 }, width: 6, height: 12, color: '#ef4444', active: true, damage: enemyDamage, owner: 'enemy'
                  });
                  state.projectiles.push({
                      id: `ep_${time}_${e.id}_r`, pos: { x: e.pos.x, y: e.pos.y + 20 }, vel: { x: 2, y: 5 }, width: 6, height: 12, color: '#ef4444', active: true, damage: enemyDamage, owner: 'enemy'
                  });
              }
          }
      }

      // Check collision with Player
      if (time > state.player.invulnerableUntil &&
          Math.abs(e.pos.x - state.player.pos.x) < (e.width + state.player.width)/2 &&
          Math.abs(e.pos.y - state.player.pos.y) < (e.height + state.player.height)/2) {
            e.active = false;
            createExplosion(e.pos.x, e.pos.y, '#ff0000', 15, true);
            
            // Shield logic
            let damageTaken = 25 + (state.stats.wave * 5); // Collision damage scales
            if (state.player.shield > 0) {
                state.player.shield -= damageTaken;
                if (state.player.shield < 0) {
                    state.player.hp += state.player.shield; // Overflow damage
                    state.player.shield = 0;
                }
            } else {
                state.player.hp -= damageTaken;
            }

            if (state.player.hp <= 0) {
              endGame();
            } else {
                onEvent("HULL_DAMAGE");
            }
      }

      if (e.pos.y > CANVAS_HEIGHT + 50) e.active = false;
    });

    // Collision: Projectile vs Enemy/Player
    state.projectiles.forEach(p => {
      if (!p.active) return;

      if (p.owner === 'player') {
          state.enemies.forEach(e => {
            if (!e.active) return;
            if (Math.abs(p.pos.x - e.pos.x) < (p.width + e.width)/2 + 5 &&
                Math.abs(p.pos.y - e.pos.y) < (p.height + e.height)/2 + 5) {
                  p.active = false;
                  e.hp -= p.damage;
                  createExplosion(p.pos.x, p.pos.y, '#fff', 3, false);
                  if (e.hp <= 0) {
                    e.active = false;
                    createExplosion(e.pos.x, e.pos.y, e.color, e.type === 'bomber' ? 30 : 15, e.type === 'bomber');
                    state.stats.score += e.scoreValue;
                    state.stats.credits += e.scoreValue; 
                    state.stats.enemiesDestroyed++;
                    state.stats.shotsHit++;
                    
                    // Spawn Powerup Chance
                    if (Math.random() < 0.1) {
                        const puType = Math.random() < 0.4 ? 'SHIELD' : (Math.random() < 0.7 ? 'SPEED' : 'WEAPON');
                        state.powerups.push({
                            id: `pu_${time}`,
                            pos: { x: e.pos.x, y: e.pos.y },
                            vel: { x: 0, y: 2 },
                            width: 20, height: 20, color: puType === 'WEAPON' ? '#fbbf24' : (puType === 'SHIELD' ? '#4ade80' : '#38bdf8'),
                            active: true, type: puType as any
                        });
                    }

                    if (state.stats.enemiesDestroyed % 20 === 0) {
                        onEvent("WAVE_CLEARED");
                        state.stats.wave++;
                    }
                  } else {
                      state.stats.shotsHit++;
                  }
            }
          });
      } else if (p.owner === 'enemy') {
          // Enemy hits player
          if (time > state.player.invulnerableUntil &&
              Math.abs(p.pos.x - state.player.pos.x) < (p.width + state.player.width)/2 &&
              Math.abs(p.pos.y - state.player.pos.y) < (p.height + state.player.height)/2) {
              p.active = false;
              createExplosion(p.pos.x, p.pos.y, '#ef4444', 5, true);
              
               // Shield logic
                if (state.player.shield > 0) {
                    state.player.shield -= p.damage;
                    if (state.player.shield < 0) {
                        state.player.hp += state.player.shield; // Overflow damage
                        state.player.shield = 0;
                    }
                } else {
                    state.player.hp -= p.damage;
                }

              if (state.player.hp <= 0) {
                  endGame();
              } else {
                  onEvent("HULL_DAMAGE");
              }
          }
      }
    });

    // Update Particles
    state.particles.forEach(p => {
      p.pos.x += p.vel.x;
      p.pos.y += p.vel.y;
      p.life--;
      p.alpha = p.life / p.maxLife;
      if (p.life <= 0) p.active = false;
    });

    // Cleanup
    state.projectiles = state.projectiles.filter(p => p.active);
    state.enemies = state.enemies.filter(e => e.active);
    state.particles = state.particles.filter(p => p.active);
    state.powerups = state.powerups.filter(p => p.active);

    // Sync Stats
    if (Math.floor(time) % 10 === 0) {
      onStatsUpdate({...state.stats});
    }

  }, [gameState, onStatsUpdate, onEvent]);

  const createExplosion = (x: number, y: number, color: string, count: number, heavy: boolean) => {
    if (heavy) gameRef.current.shake = 10;
    
    for (let i = 0; i < count; i++) {
      gameRef.current.particles.push({
        id: `pt_${Math.random()}`,
        pos: { x, y },
        vel: { x: (Math.random() - 0.5) * (heavy ? 12 : 6), y: (Math.random() - 0.5) * (heavy ? 12 : 6) },
        width: Math.random() * 4 + 1,
        height: Math.random() * 4 + 1,
        color: Math.random() > 0.5 ? color : '#ffffff', // Color variance
        active: true,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        alpha: 1,
        scale: Math.random() * 2 + 1
      });
    }
  };

  const endGame = () => {
    setGameState(GameState.GAME_OVER);
    onStatsUpdate({...gameRef.current.stats});
  };

  // Draw Loop
  const draw = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw frame
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Apply Screen Shake
    ctx.save();
    if (gameState === GameState.PLAYING && gameRef.current.shake > 0) {
        const dx = (Math.random() - 0.5) * gameRef.current.shake;
        const dy = (Math.random() - 0.5) * gameRef.current.shake;
        ctx.translate(dx, dy);
    }

    // Draw Background Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < CANVAS_WIDTH; i += 50) {
      ctx.moveTo(i, 0); ctx.lineTo(i, CANVAS_HEIGHT);
    }
    for (let i = 0; i < CANVAS_HEIGHT; i += 50) {
      ctx.moveTo(0, i); ctx.lineTo(CANVAS_WIDTH, i);
    }
    ctx.stroke();

    const state = gameRef.current;

    // Draw Powerups
    state.powerups.forEach(p => {
        ctx.save();
        ctx.translate(p.pos.x, p.pos.y);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.type[0], 0, 0);
        ctx.restore();
    });

    // Draw Player
    if (gameState === GameState.PLAYING || gameState === GameState.SHOP || gameState === GameState.PAUSED) {
        ctx.save();
        ctx.translate(state.player.pos.x, state.player.pos.y);
        
        // Invulnerability Flashing
        if (time < state.player.invulnerableUntil) {
             const flash = Math.floor(time / 100) % 2 === 0;
             ctx.globalAlpha = flash ? 0.4 : 1.0;
        }

        // Shield Visual (Aura)
        if (state.player.shield > 0) {
            ctx.beginPath();
            ctx.arc(0, 0, 32 + Math.sin(time * 0.01) * 2, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(56, 189, 248, ${state.player.shield / state.player.maxShield})`;
            ctx.lineWidth = 2 + Math.sin(time * 0.01) * 1;
            ctx.stroke();
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#38bdf8';
        }

        // Glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = state.player.color;
        
        // Jet Body
        ctx.fillStyle = state.player.color;
        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(15, 15);
        ctx.lineTo(0, 10);
        ctx.lineTo(-15, 15);
        ctx.closePath();
        ctx.fill();

        // Engine Trail
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(-5, 15);
        ctx.lineTo(0, 25 + Math.random() * 10);
        ctx.lineTo(5, 15);
        ctx.fill();
        
        // Visual indicators for weapon level
        if (state.player.weaponLevel >= 2) {
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(-20, 5, 5, 15);
            ctx.fillRect(15, 5, 5, 15);
        }
        if (state.player.weaponLevel >= 3) {
            ctx.fillStyle = '#0284c7';
            ctx.fillRect(-25, 10, 3, 10);
            ctx.fillRect(22, 10, 3, 10);
        }
        
        ctx.globalAlpha = 1.0; // Reset Alpha
        ctx.restore();
    }

    // Draw Enemies
    state.enemies.forEach(e => {
      ctx.save();
      ctx.translate(e.pos.x, e.pos.y);
      
      // Homing/Targeting Indicator for Seekers
      if (e.type === 'seeker') {
          ctx.save();
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; // Red faint line
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          // Draw line to player relative to enemy pos
          ctx.lineTo(state.player.pos.x - e.pos.x, state.player.pos.y - e.pos.y);
          ctx.stroke();
          
          // Rotating reticle around enemy
          ctx.rotate(time * 0.005);
          ctx.strokeStyle = '#db2777';
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(0, 0, 25, 0, Math.PI * 1.5); // Broken circle
          ctx.stroke();
          ctx.restore();
      }

      ctx.fillStyle = e.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = e.color;
      
      if (e.type === 'drone') {
          ctx.beginPath();
          ctx.moveTo(0, 15);
          ctx.lineTo(10, -10);
          ctx.lineTo(-10, -10);
          ctx.closePath();
          ctx.fill();
      } else if (e.type === 'seeker') {
          ctx.beginPath();
          ctx.moveTo(0, 15);
          ctx.lineTo(8, -8);
          ctx.lineTo(0, -5);
          ctx.lineTo(-8, -8);
          ctx.closePath();
          ctx.fill();
      } else {
          // Fighter/Bomber
          const size = e.type === 'bomber' ? 20 : 15;
          ctx.fillRect(-size, -size, size*2, size*2);
          // Wings
          ctx.fillStyle = '#7f1d1d';
          ctx.beginPath();
          ctx.moveTo(-size, -5);
          ctx.lineTo(-size*2, -size);
          ctx.lineTo(-size, 10);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(size, -5);
          ctx.lineTo(size*2, -size);
          ctx.lineTo(size, 10);
          ctx.fill();
      }
      ctx.restore();
    });

    // Draw Projectiles
    state.projectiles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 5;
      ctx.shadowColor = p.color;
      ctx.fillRect(p.pos.x - p.width/2, p.pos.y - p.height/2, p.width, p.height);
    });

    // Draw Particles
    state.particles.forEach(p => {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, (p.scale || 1) * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    ctx.restore(); // Restore shake

  }, [gameState]);

  const loop = useCallback((time: number) => {
    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;

    update(deltaTime, time);
    draw(time);
    
    requestRef.current = requestAnimationFrame(loop);
  }, [update, draw]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [loop]);

  return (
    <canvas 
      ref={canvasRef} 
      width={CANVAS_WIDTH} 
      height={CANVAS_HEIGHT}
      className="max-w-full h-auto cursor-none touch-none shadow-2xl shadow-blue-900/20 rounded border border-slate-800 bg-slate-950"
    />
  );
});

GameCanvas.displayName = "GameCanvas";
