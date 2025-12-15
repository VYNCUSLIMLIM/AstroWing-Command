import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { GameState, Entity, Player, Enemy, Projectile, Particle, GameStats, PowerUp } from '../types';

interface GameCanvasProps {
  gameState: GameState;
  setGameState: (state: GameState) => void;
  onStatsUpdate: (stats: GameStats) => void;
  onEvent: (event: string) => void;
  eyeTrackingEnabled: boolean;
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
  onEvent,
  eyeTrackingEnabled
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const gameTimeRef = useRef<number>(0); // Track logic time separately from wall clock
  const spawnTimerRef = useRef<number>(0);
  const inputModeRef = useRef<'MOUSE' | 'KEYBOARD' | 'EYE'>('MOUSE');
  
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
    gazePos: { x: number; y: number } | null;
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
    shake: 0,
    gazePos: null
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

  // Initialize WebGazer
  useEffect(() => {
    const startWebGazer = async () => {
        if (eyeTrackingEnabled && (window as any).webgazer) {
            const webgazer = (window as any).webgazer;
            
            // Clear any previous listeners
            webgazer.clearGazeListener();
            
            webgazer.setGazeListener((data: any, clock: any) => {
                if (data && canvasRef.current) {
                    const rect = canvasRef.current.getBoundingClientRect();
                    const scaleX = CANVAS_WIDTH / rect.width;
                    const scaleY = CANVAS_HEIGHT / rect.height;
                    
                    const gazeX = (data.x - rect.left) * scaleX;
                    const gazeY = (data.y - rect.top) * scaleY;
                    
                    // Store raw gaze for debugging/visuals
                    gameRef.current.gazePos = { x: gazeX, y: gazeY };
                    
                    // Directly update target position for smooth lerp in update loop
                    gameRef.current.mousePos = { x: gazeX, y: gazeY };
                    inputModeRef.current = 'EYE';
                }
            }).begin();

            webgazer.showVideo(true);
            webgazer.showFaceOverlay(true);
            webgazer.showFaceFeedbackBox(true);
        }
    };

    const stopWebGazer = () => {
        if ((window as any).webgazer) {
            const webgazer = (window as any).webgazer;
            webgazer.end();
            webgazer.showVideo(false);
            webgazer.showFaceOverlay(false);
            webgazer.showFaceFeedbackBox(false);
            // Manually hide video if webgazer doesn't cleanup properly
            const videoEl = document.getElementById('webgazerVideoFeed');
            if (videoEl) videoEl.style.display = 'none';
        }
    };

    if (eyeTrackingEnabled) {
        startWebGazer();
    } else {
        stopWebGazer();
    }

    return () => {
        stopWebGazer();
    };
  }, [eyeTrackingEnabled]);

  // Reset Game
  const resetGame = useCallback(() => {
    gameTimeRef.current = 0;
    gameRef.current.player = {
      id: 'p1', pos: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 100 }, vel: { x: 0, y: 0 },
      width: 40, height: 40, color: '#0ea5e9', active: true,
      hp: 100, maxHp: 100, shield: 50, maxShield: 50, fireRate: 150, lastFired: 0,
      weaponLevel: 1, speedMultiplier: 1, invulnerableUntil: 3000 // 3 seconds invulnerability
    };
    gameRef.current.enemies = [];
    gameRef.current.projectiles = [];
    gameRef.current.particles = [];
    gameRef.current.powerups = [];
    gameRef.current.stats = { score: 0, credits: 0, wave: 1, enemiesDestroyed: 0, accuracy: 0, shotsFired: 0, shotsHit: 0, timeSurvived: 0, weaponLevel: 1 };
    gameRef.current.shake = 0;
    spawnTimerRef.current = 0;
    lastTimeRef.current = performance.now();
  }, []);

  useEffect(() => {
    // Only reset if starting a new game, not resuming
    if (gameState === GameState.PLAYING && gameRef.current.stats.timeSurvived === 0) {
      resetGame();
    }
  }, [gameState, resetGame]);

  // Input Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { 
        gameRef.current.keys[e.code] = true; 
        if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(e.code)) {
            inputModeRef.current = 'KEYBOARD';
        }
    };
    const handleKeyUp = (e: KeyboardEvent) => { gameRef.current.keys[e.code] = false; };
    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current || eyeTrackingEnabled) return; // Ignore mouse if eye tracking is on
      
      inputModeRef.current = 'MOUSE';
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
  }, [eyeTrackingEnabled]);

  // Update Loop
  const update = useCallback((deltaTime: number) => {
    const state = gameRef.current;
    
    // Halt logic if paused
    if (gameState !== GameState.PLAYING) return;

    // Advance Game Time
    gameTimeRef.current += deltaTime;
    const time = gameTimeRef.current;

    state.stats.timeSurvived += deltaTime / 1000;

    // Screen Shake Decay
    if (state.shake > 0) state.shake *= 0.9;
    if (state.shake < 0.5) state.shake = 0;

    // Player Movement
    const speed = 7 * state.player.speedMultiplier; // Base speed
    
    if (inputModeRef.current === 'KEYBOARD') {
        let dx = 0;
        let dy = 0;
        if (state.keys['KeyW'] || state.keys['ArrowUp']) dy -= 1;
        if (state.keys['KeyS'] || state.keys['ArrowDown']) dy += 1;
        if (state.keys['KeyA'] || state.keys['ArrowLeft']) dx -= 1;
        if (state.keys['KeyD'] || state.keys['ArrowRight']) dx += 1;
        
        // Normalize diagonal
        if (dx !== 0 && dy !== 0) {
            const mag = Math.sqrt(dx*dx + dy*dy);
            dx /= mag;
            dy /= mag;
        }
        
        state.player.pos.x += dx * speed;
        state.player.pos.y += dy * speed;
    } else {
        // Mouse/Eye Lerp
        // Increase smoothing (lower lerp) for eye tracking to reduce jitter
        const lerpFactor = (inputModeRef.current === 'EYE' ? 0.08 : 0.25) * state.player.speedMultiplier;
        state.player.pos.x += (state.mousePos.x - state.player.pos.x) * lerpFactor;
        state.player.pos.y += (state.mousePos.y - state.player.pos.y) * lerpFactor;
    }

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
      let hp = 30 + (state.stats.wave * 5); 
      let width = 30;
      let color = '#f97316';
      let scoreValue = 100;
      let shield = 0;
      
      // Enemy Types
      // Minelayer: Wave 2+
      // Guardian: Wave 3+
      if (state.stats.wave >= 3 && rand > 0.9) {
          type = 'guardian'; hp = 200 + (state.stats.wave * 15); width = 45; color = '#3b82f6'; scoreValue = 400; shield = 100;
          onEvent("ENEMY_SPAWN_GUARDIAN");
      } else if (state.stats.wave >= 2 && rand > 0.8) {
          type = 'minelayer'; hp = 100 + (state.stats.wave * 10); width = 50; color = '#fbbf24'; scoreValue = 250;
          onEvent("ENEMY_SPAWN_MINELAYER");
      } else if (rand > 0.95) { type = 'bomber'; hp = 150 + (state.stats.wave * 10); width = 50; color = '#4c1d95'; scoreValue = 300; }
      else if (rand > 0.8) { type = 'seeker'; hp = 50 + (state.stats.wave * 5); width = 35; color = '#db2777'; scoreValue = 150; }
      else if (rand > 0.6) { type = 'fighter'; hp = 60 + (state.stats.wave * 5); width = 40; color = '#ef4444'; scoreValue = 200; }

      state.enemies.push({
        id: `e_${time}`,
        pos: { x: Math.random() * (CANVAS_WIDTH - 40) + 20, y: -40 },
        vel: { x: (Math.random() - 0.5) * 2, y: Math.random() * 2 + 1 + (state.stats.wave * 0.1) },
        width, height: width, color,
        active: true, hp, type, scoreValue, 
        pattern: Math.floor(Math.random() * 3),
        lastFired: 0,
        shield, maxShield: shield
      });
    }

    // Update Projectiles
    state.projectiles.forEach(p => {
      // Homing Logic for Tracking Projectiles
      if (p.tracking && p.owner === 'enemy') {
          const dx = state.player.pos.x - p.pos.x;
          const dy = state.player.pos.y - p.pos.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist > 0) {
              // Steer velocity towards player
              const speed = 4;
              p.vel.x = (p.vel.x * 0.95) + ((dx/dist) * speed * 0.05);
              p.vel.y = (p.vel.y * 0.95) + ((dy/dist) * speed * 0.05);
          }
      }

      // Mine Logic (Drift slowly)
      if (p.isMine) {
          p.vel.x *= 0.95;
          p.vel.y = 1; // Slow drift down
      }

      p.pos.x += p.vel.x;
      p.pos.y += p.vel.y;
      if (p.pos.y < -50 || p.pos.y > CANVAS_HEIGHT + 50 || p.pos.x < -50 || p.pos.x > CANVAS_WIDTH + 50) p.active = false;
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
    const enemyDamage = 15 + (state.stats.wave * 3); 

    // Update Enemies
    state.enemies.forEach(e => {
      e.pos.x += e.vel.x;
      e.pos.y += e.vel.y;
      
      // Behavior Patterns
      if (e.type === 'seeker') {
          const moveSpeed = 1 + (state.stats.wave * 0.05);
          if (e.pos.x < state.player.pos.x) e.pos.x += moveSpeed;
          else e.pos.x -= moveSpeed;
      } else if (e.type === 'minelayer') {
          // Move horizontally, stay near top/middle
          e.vel.y = e.pos.y > 200 ? -0.5 : 0.5;
          e.vel.x = Math.sin(time * 0.002) * 2;
      } else if (e.type === 'guardian') {
          // Slow steady advance
          e.vel.y = 0.5;
          e.vel.x = Math.sin(time * 0.001) * 0.5;
      } else if (e.pattern === 1) {
          e.pos.x += Math.sin(time * 0.005) * 2;
      }

      // Shooting Logic
      if (e.pos.y > 0 && e.pos.y < CANVAS_HEIGHT - 50) {
          let fireInterval = 2000;
          if (e.type === 'minelayer') fireInterval = 3000;
          if (e.type === 'guardian') fireInterval = 2500;
          
          if (time - (e.lastFired || 0) > fireInterval) {
              e.lastFired = time;
              
              if (e.type === 'minelayer') {
                  // Drop Mine
                  state.projectiles.push({
                    id: `ep_mine_${time}_${e.id}`,
                    pos: { x: e.pos.x, y: e.pos.y + 20 },
                    vel: { x: 0, y: 0 },
                    width: 15, height: 15, color: '#fbbf24', active: true,
                    damage: 40, owner: 'enemy', isMine: true
                  });
              } else if (e.type === 'guardian') {
                   // Fire Tracking Missile
                   state.projectiles.push({
                    id: `ep_track_${time}_${e.id}`,
                    pos: { x: e.pos.x, y: e.pos.y + 20 },
                    vel: { x: 0, y: 3 },
                    width: 8, height: 8, color: '#f87171', active: true,
                    damage: 25, owner: 'enemy', tracking: true
                  });
              } else if (e.type === 'fighter' || e.type === 'bomber') {
                state.projectiles.push({
                    id: `ep_${time}_${e.id}`,
                    pos: { x: e.pos.x, y: e.pos.y + 20 },
                    vel: { x: 0, y: 6 },
                    width: 6, height: 12, color: '#ef4444', active: true,
                    damage: enemyDamage, owner: 'enemy'
                });
                if (e.type === 'bomber') {
                    state.projectiles.push({
                        id: `ep_${time}_${e.id}_l`, pos: { x: e.pos.x, y: e.pos.y + 20 }, vel: { x: -2, y: 5 }, width: 6, height: 12, color: '#ef4444', active: true, damage: enemyDamage, owner: 'enemy'
                    });
                    state.projectiles.push({
                        id: `ep_${time}_${e.id}_r`, pos: { x: e.pos.x, y: e.pos.y + 20 }, vel: { x: 2, y: 5 }, width: 6, height: 12, color: '#ef4444', active: true, damage: enemyDamage, owner: 'enemy'
                    });
                }
             }
          }
      }

      // Check collision with Player
      if (time > state.player.invulnerableUntil &&
          Math.abs(e.pos.x - state.player.pos.x) < (e.width + state.player.width)/2 &&
          Math.abs(e.pos.y - state.player.pos.y) < (e.height + state.player.height)/2) {
            
            // Guardian Shield Impact Logic
            if (e.type === 'guardian' && (e.shield || 0) > 0) {
                 e.shield = 0; // Destroy shield on impact
                 createExplosion(e.pos.x, e.pos.y, '#3b82f6', 10, true);
            } else {
                 e.active = false;
                 createExplosion(e.pos.x, e.pos.y, '#ff0000', 15, true);
            }
            
            // Player Damage
            let damageTaken = 25 + (state.stats.wave * 5); 
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

                  // Hit Shield First
                  if ((e.shield || 0) > 0) {
                      e.shield! -= p.damage;
                      createExplosion(p.pos.x, p.pos.y, '#60a5fa', 2, false); // Shield Spark
                      if (e.shield! < 0) {
                          e.hp += e.shield!; // Overflow to Hull
                          e.shield = 0;
                      }
                  } else {
                      e.hp -= p.damage;
                      createExplosion(p.pos.x, p.pos.y, '#fff', 3, false);
                  }

                  if (e.hp <= 0) {
                    e.active = false;
                    createExplosion(e.pos.x, e.pos.y, e.color, e.type === 'bomber' ? 30 : 15, e.type === 'bomber');
                    state.stats.score += e.scoreValue;
                    state.stats.credits += e.scoreValue; 
                    state.stats.enemiesDestroyed++;
                    state.stats.shotsHit++;
                    
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
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Use the frozen game time if paused, otherwise current game time
    const time = gameTimeRef.current;

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
             ctx.globalAlpha = flash ? 0.3 : 0.8;
             // White Overlay for flash
             if (flash) {
                 ctx.fillStyle = '#ffffff';
                 ctx.beginPath();
                 ctx.arc(0, 0, 25, 0, Math.PI * 2);
                 ctx.fill();
             }
        }

        // Shield Visual (Aura) - Pulsating
        if (state.player.shield > 0) {
            ctx.beginPath();
            // Vary size and opacity based on shield strength and sine wave
            const pulse = Math.sin(time * 0.01);
            const intensity = state.player.shield / state.player.maxShield;
            
            ctx.arc(0, 0, 32 + pulse * 3, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(56, 189, 248, ${0.4 * intensity + 0.2 + pulse * 0.1})`;
            ctx.lineWidth = 2 + pulse * 1;
            ctx.stroke();
            
            // Inner Shield
            ctx.beginPath();
            ctx.arc(0, 0, 25, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(56, 189, 248, ${0.1 * intensity})`;
            ctx.fill();
            
            ctx.shadowBlur = 15 * intensity;
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
        
        // Tracking Projectile Warning (HUD Reticle)
        const incomingMissiles = state.projectiles.filter(p => p.tracking && p.owner === 'enemy');
        incomingMissiles.forEach(missile => {
            const dx = missile.pos.x - state.player.pos.x;
            const dy = missile.pos.y - state.player.pos.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < 200) {
                 ctx.save();
                 ctx.rotate(Math.atan2(dy, dx));
                 ctx.translate(40, 0); // Offset from player center
                 ctx.fillStyle = '#ef4444';
                 ctx.beginPath();
                 ctx.moveTo(0, 0);
                 ctx.lineTo(10, -5);
                 ctx.lineTo(10, 5);
                 ctx.fill();
                 ctx.restore();
            }
        });

        // Show "LOCKED" warning if seeker nearby
        const lockingEnemy = state.enemies.find(e => e.type === 'seeker');
        if (lockingEnemy) {
            ctx.fillStyle = '#ef4444';
            ctx.font = '10px monospace';
            ctx.fillText('! WARNING !', 0, -35);
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
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(state.player.pos.x - e.pos.x, state.player.pos.y - e.pos.y);
          ctx.stroke();
          ctx.restore();
      }

      ctx.shadowBlur = 10;
      ctx.shadowColor = e.color;
      ctx.fillStyle = e.color;
      
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
      } else if (e.type === 'minelayer') {
          // Bulky Hexagon
          ctx.beginPath();
          for(let i=0; i<6; i++) {
              const angle = (i * Math.PI) / 3;
              const r = 25;
              ctx.lineTo(Math.cos(angle)*r, Math.sin(angle)*r);
          }
          ctx.closePath();
          ctx.fill();
          // Stripe
          ctx.fillStyle = '#000';
          ctx.fillRect(-20, -5, 40, 10);
      } else if (e.type === 'guardian') {
          // Shield Ring
          if ((e.shield || 0) > 0) {
              ctx.strokeStyle = '#60a5fa';
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.arc(0, 0, 30, 0, Math.PI*2);
              ctx.stroke();
          }
          // Core
          ctx.fillStyle = e.color;
          ctx.beginPath();
          ctx.arc(0, 0, 20, 0, Math.PI*2);
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
      
      if (p.isMine) {
          // Spiky Mine
          ctx.beginPath();
          ctx.arc(p.pos.x, p.pos.y, 8, 0, Math.PI*2);
          ctx.fill();
          // Spikes
          if (Math.floor(time/200) % 2 === 0) { // Blink
              ctx.strokeStyle = '#ef4444';
              ctx.stroke();
          }
      } else if (p.tracking) {
          // Diamond shape for missiles
          ctx.save();
          ctx.translate(p.pos.x, p.pos.y);
          ctx.rotate(Math.atan2(p.vel.y, p.vel.x));
          ctx.beginPath();
          ctx.moveTo(5, 0);
          ctx.lineTo(-5, 3);
          ctx.lineTo(-5, -3);
          ctx.fill();
          ctx.restore();
      } else {
          ctx.fillRect(p.pos.x - p.width/2, p.pos.y - p.height/2, p.width, p.height);
      }
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

    // Draw Gaze Debug Point
    if (eyeTrackingEnabled && state.gazePos) {
        ctx.save();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.beginPath();
        ctx.arc(state.gazePos.x, state.gazePos.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    }

    ctx.restore(); // Restore shake

  }, [gameState, eyeTrackingEnabled]);

  const loop = useCallback((time: number) => {
    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;

    update(deltaTime);
    draw();
    
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