import React, { useState, useEffect, useRef } from 'react';
import { GameCanvas, GameCanvasHandle } from './components/GameCanvas';
import { generateBriefing, generateTacticalUpdate, generateDebrief } from './services/geminiService';
import { GameState, GameStats, MissionLog } from './types';
import { Monitor, Shield, Target, Award, Play, RotateCcw, AlertTriangle, ShoppingCart, Zap, Plus, Hammer, Pause } from 'lucide-react';

export default function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [stats, setStats] = useState<GameStats>({
    score: 0, credits: 0, wave: 1, enemiesDestroyed: 0, accuracy: 0, shotsFired: 0, shotsHit: 0, timeSurvived: 0, weaponLevel: 1
  });
  const [logs, setLogs] = useState<MissionLog[]>([]);
  const [debrief, setDebrief] = useState<{rank: string, message: string} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const gameCanvasRef = useRef<GameCanvasHandle>(null);

  const addLog = (sender: MissionLog['sender'], message: string, priority: MissionLog['priority'] = 'normal') => {
    setLogs(prev => [...prev.slice(-4), { // Keep last 5 logs
      id: Math.random().toString(36),
      sender,
      message,
      timestamp: Date.now(),
      priority
    }]);
  };

  const handleGameEvent = async (event: string) => {
    // Throttled AI calls or specific events
    if (event === 'HULL_DAMAGE' && Math.random() > 0.7) {
        const msg = await generateTacticalUpdate('Hull Critical', stats.score);
        addLog('AI', msg, 'high');
    }
    if (event === 'WAVE_CLEARED') {
        const msg = await generateTacticalUpdate('Wave Cleared', stats.score);
        addLog('AI', msg, 'normal');
    }
    if (event === 'WEAPON_UPGRADED') {
        addLog('SYSTEM', 'Weapon systems upgraded.', 'high');
    }
    if (event === 'REPAIR_COMPLETE') {
        addLog('SYSTEM', 'Hull repair completed.', 'normal');
    }
  };

  const startGame = async () => {
    setIsLoading(true);
    setLogs([]);
    setDebrief(null);
    try {
      // Pre-fetch briefing
      const briefing = await generateBriefing();
      addLog('COMMAND', briefing, 'high');
    } catch (e) {
      addLog('SYSTEM', 'Link established. Good hunting.', 'normal');
    }
    setIsLoading(false);
    setGameState(GameState.PLAYING);
  };

  const handleGameOver = async (finalStats: GameStats) => {
    setGameState(GameState.GAME_OVER);
    setIsLoading(true);
    try {
        const result = await generateDebrief(finalStats);
        setDebrief(result);
        addLog('COMMAND', `Debrief: ${result.message}`, 'normal');
    } catch (e) {
        setDebrief({ rank: 'PILOT', message: 'Connection lost. RTB.'});
    }
    setIsLoading(false);
  };

  const toggleShop = () => {
    if (gameState === GameState.PLAYING) {
        setGameState(GameState.SHOP);
    } else if (gameState === GameState.SHOP) {
        setGameState(GameState.PLAYING);
    }
  };

  const togglePause = () => {
      if (gameState === GameState.PLAYING) {
          setGameState(GameState.PAUSED);
      } else if (gameState === GameState.PAUSED) {
          setGameState(GameState.PLAYING);
      }
  };

  const purchaseItem = (type: 'WEAPON' | 'REPAIR') => {
    if (gameCanvasRef.current) {
        const success = gameCanvasRef.current.purchaseUpgrade(type);
        if (!success) {
            addLog('SYSTEM', 'Insufficient credits.', 'low');
        }
    }
  };

  // Keyboard shortcut for Shop and Pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'KeyB') {
            toggleShop();
        }
        if (e.code === 'KeyP') {
            togglePause();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden flex flex-col items-center justify-center scanlines font-display">
      
      {/* HUD Header */}
      <div className="w-full max-w-4xl p-4 flex justify-between items-center bg-slate-900/80 border-b border-cyan-900/50 backdrop-blur-md z-10 fixed top-0 left-0 right-0 mx-auto rounded-b-xl">
         <div className="flex items-center gap-4">
            <div className="p-2 bg-cyan-900/30 rounded border border-cyan-500/30">
                <Monitor className="text-cyan-400 w-6 h-6" />
            </div>
            <div>
                <h1 className="text-xl font-bold tracking-wider text-cyan-100">ASTROWING <span className="text-cyan-500">ACE</span></h1>
                <div className="flex gap-4 text-xs text-cyan-400/70 font-mono">
                    <span>SYS: ONLINE</span>
                    <span>NET: SECURE</span>
                </div>
            </div>
         </div>
         
         <div className="flex gap-8 font-mono text-xl">
             <div className="flex flex-col items-center">
                 <span className="text-xs text-slate-500">CREDITS</span>
                 <span className="text-yellow-400">{stats.credits.toString().padStart(6, '0')}</span>
             </div>
             <div className="flex flex-col items-center">
                 <span className="text-xs text-slate-500">SCORE</span>
                 <span className="text-cyan-400">{stats.score.toString().padStart(6, '0')}</span>
             </div>
             <div className="flex flex-col items-center">
                 <span className="text-xs text-slate-500">WAVE</span>
                 <span className="text-orange-400">{stats.wave}</span>
             </div>
         </div>
      </div>

      {/* Main Game Container */}
      <div className="relative w-full max-w-4xl h-full flex flex-col md:flex-row items-center justify-center gap-4 pt-24 pb-4 px-4">
        
        {/* Left Panel: Status */}
        <div className="hidden md:flex flex-col gap-4 w-64 h-[600px] justify-between">
             <div className="bg-slate-900/50 p-4 border-l-2 border-cyan-500/50 rounded-r-lg">
                 <h2 className="text-sm text-cyan-500 mb-2 flex items-center gap-2"><Target size={14}/> MISSION STATS</h2>
                 <div className="space-y-2 text-sm font-mono text-slate-300">
                     <div className="flex justify-between">
                         <span>Weapon Lvl</span>
                         <span className="text-yellow-400">MK-{stats.weaponLevel}</span>
                     </div>
                     <div className="flex justify-between">
                         <span>Kills</span>
                         <span>{stats.enemiesDestroyed}</span>
                     </div>
                     <div className="flex justify-between">
                         <span>Time</span>
                         <span>{Math.floor(stats.timeSurvived)}s</span>
                     </div>
                     <div className="flex justify-between">
                         <span>Acc</span>
                         <span>{stats.shotsFired > 0 ? Math.round((stats.shotsHit / stats.shotsFired) * 100) : 100}%</span>
                     </div>
                 </div>
                 
                 {/* Shop Button */}
                 {(gameState === GameState.PLAYING || gameState === GameState.SHOP || gameState === GameState.PAUSED) && (
                     <button 
                        onClick={toggleShop}
                        disabled={gameState === GameState.PAUSED}
                        className="mt-6 w-full py-2 bg-yellow-600/20 border border-yellow-500/50 text-yellow-400 hover:bg-yellow-600/40 transition-colors flex items-center justify-center gap-2 text-xs font-bold disabled:opacity-50"
                     >
                        <ShoppingCart size={14}/> {gameState === GameState.SHOP ? 'CLOSE ARMORY' : 'OPEN ARMORY [B]'}
                     </button>
                 )}
             </div>

             <div className="bg-slate-900/50 p-4 border-l-2 border-orange-500/50 rounded-r-lg flex-1 overflow-hidden flex flex-col">
                 <h2 className="text-sm text-orange-500 mb-2 flex items-center gap-2"><AlertTriangle size={14}/> COMMS LOG</h2>
                 <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                    {logs.map((log) => (
                        <div key={log.id} className={`text-xs p-2 rounded ${log.sender === 'COMMAND' ? 'bg-cyan-950/50 border border-cyan-900' : 'bg-slate-800/50 border border-slate-700'}`}>
                            <div className="flex justify-between text-[10px] opacity-50 mb-1">
                                <span>{log.sender}</span>
                                <span>{new Date(log.timestamp).toLocaleTimeString([], {hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit'})}</span>
                            </div>
                            <p className={`${log.priority === 'high' ? 'text-red-400 font-bold' : 'text-slate-200'}`}>{log.message}</p>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                 </div>
             </div>
        </div>

        {/* Center: Game Area */}
        <div className="relative group">
            <GameCanvas 
                ref={gameCanvasRef}
                gameState={gameState} 
                setGameState={setGameState} 
                onStatsUpdate={(newStats) => {
                    // Update stats but keep local UI state synced
                    if(gameState === GameState.PLAYING || gameState === GameState.SHOP || gameState === GameState.PAUSED) setStats(newStats);
                    if(gameState === GameState.GAME_OVER && stats.score !== newStats.score) handleGameOver(newStats);
                }} 
                onEvent={handleGameEvent}
            />
            
            {/* Start Screen Overlay */}
            {gameState === GameState.MENU && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                    <div className="text-center space-y-6 animate-float">
                        <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-cyan-300 to-blue-600 drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]">
                            ASTROWING
                        </h1>
                        <p className="text-cyan-200/60 tracking-[0.3em] text-sm">ADVANCED TACTICAL SIMULATOR</p>
                        <button 
                            onClick={startGame}
                            disabled={isLoading}
                            className="group relative px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold tracking-widest transition-all clip-path-polygon"
                        >
                            <span className="relative z-10 flex items-center gap-2">
                                {isLoading ? 'INITIALIZING...' : 'ENGAGE SYSTEM'} <Play size={16} fill="currentColor"/>
                            </span>
                            <div className="absolute inset-0 bg-white/20 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"/>
                        </button>
                    </div>
                </div>
            )}

            {/* Paused Overlay */}
            {gameState === GameState.PAUSED && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-30 backdrop-blur-sm">
                     <div className="bg-slate-900/80 border border-cyan-500/50 p-8 rounded-xl text-center shadow-2xl shadow-cyan-900/50 transform scale-110">
                         <h2 className="text-3xl font-black text-white tracking-[0.2em] mb-2 flex items-center justify-center gap-4">
                             <Pause className="w-8 h-8 text-cyan-400" fill="currentColor"/>
                             PAUSED
                         </h2>
                         <p className="text-cyan-200/50 font-mono text-sm mb-6">SYSTEMS SUSPENDED</p>
                         <button 
                            onClick={togglePause}
                            className="px-8 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded transition-colors"
                         >
                             RESUME [P]
                         </button>
                     </div>
                </div>
            )}

            {/* Shop Overlay */}
            {gameState === GameState.SHOP && (
                <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center z-30 backdrop-blur-md p-6">
                    <div className="w-full max-w-md border border-yellow-500/30 bg-black/50 p-6 rounded-lg shadow-2xl shadow-yellow-900/20">
                        <div className="flex justify-between items-center mb-6 border-b border-yellow-500/30 pb-4">
                            <h2 className="text-2xl font-bold text-yellow-500 flex items-center gap-2"><ShoppingCart /> FIELD ARMORY</h2>
                            <span className="text-yellow-400 font-mono">{stats.credits} CREDITS</span>
                        </div>

                        <div className="space-y-4">
                             {/* Weapon Upgrade */}
                             <button 
                                onClick={() => purchaseItem('WEAPON')}
                                disabled={stats.weaponLevel >= 4 || stats.credits < stats.weaponLevel * 2500}
                                className="w-full p-4 bg-slate-900/80 border border-slate-700 hover:border-yellow-500 group transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left"
                             >
                                 <div className="flex justify-between items-start">
                                     <div>
                                         <div className="text-yellow-400 font-bold flex items-center gap-2"><Zap size={16}/> UPGRADE WEAPON</div>
                                         <div className="text-xs text-slate-400 mt-1">
                                             {stats.weaponLevel === 1 && "Install Dual-Phase Blasters"}
                                             {stats.weaponLevel === 2 && "Install Tri-Spread Cannon"}
                                             {stats.weaponLevel === 3 && "Install Omni-Directional Array"}
                                             {stats.weaponLevel >= 4 && "MAXIMUM POWER REACHED"}
                                         </div>
                                     </div>
                                     <div className="text-right">
                                         <div className="text-yellow-500 font-mono">{stats.weaponLevel < 4 ? stats.weaponLevel * 2500 : '---'} CR</div>
                                         <div className="text-[10px] text-slate-500">MK-{stats.weaponLevel} ➞ MK-{Math.min(4, stats.weaponLevel+1)}</div>
                                     </div>
                                 </div>
                             </button>

                             {/* Repair */}
                             <button 
                                onClick={() => purchaseItem('REPAIR')}
                                disabled={stats.credits < 1000}
                                className="w-full p-4 bg-slate-900/80 border border-slate-700 hover:border-green-500 group transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left"
                             >
                                 <div className="flex justify-between items-start">
                                     <div>
                                         <div className="text-green-400 font-bold flex items-center gap-2"><Hammer size={16}/> EMERGENCY REPAIRS</div>
                                         <div className="text-xs text-slate-400 mt-1">Restore 50% Hull Integrity</div>
                                     </div>
                                     <div className="text-right">
                                         <div className="text-green-500 font-mono">1000 CR</div>
                                         <div className="text-[10px] text-slate-500">+50 HP</div>
                                     </div>
                                 </div>
                             </button>
                        </div>

                        <button 
                            onClick={toggleShop}
                            className="mt-6 w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold uppercase tracking-wider text-xs"
                        >
                            Return to Combat
                        </button>
                    </div>
                </div>
            )}

            {/* Game Over Overlay */}
            {gameState === GameState.GAME_OVER && (
                <div className="absolute inset-0 bg-red-950/90 flex flex-col items-center justify-center z-20 backdrop-blur-md p-8">
                     <h2 className="text-4xl font-bold text-red-500 mb-2">MISSION FAILED</h2>
                     <p className="text-red-200/50 mb-8 font-mono">SIGNAL LOST</p>
                     
                     <div className="grid grid-cols-2 gap-8 w-full max-w-sm mb-8">
                         <div className="bg-black/40 p-4 rounded border border-red-900/50 text-center">
                             <div className="text-xs text-red-400 uppercase">Final Score</div>
                             <div className="text-2xl font-mono">{stats.score}</div>
                         </div>
                         <div className="bg-black/40 p-4 rounded border border-red-900/50 text-center">
                             <div className="text-xs text-red-400 uppercase">Rank</div>
                             <div className="text-2xl font-mono text-yellow-400">{isLoading ? 'CALCULATING...' : debrief?.rank || 'UNKNOWN'}</div>
                         </div>
                     </div>

                     {debrief && (
                         <div className="max-w-md bg-black/50 border-l-4 border-yellow-500 p-4 mb-8 text-sm text-slate-300 italic">
                             "{debrief.message}"
                             <div className="text-right text-[10px] text-slate-500 mt-2">- MISSION COMMAND</div>
                         </div>
                     )}

                     <button 
                        onClick={startGame}
                        className="px-6 py-2 border border-white/20 hover:bg-white/10 flex items-center gap-2 transition-colors"
                     >
                         <RotateCcw size={16}/> REBOOT SYSTEM
                     </button>
                </div>
            )}
        </div>

        {/* Mobile Log View (Below Game) */}
        <div className="md:hidden w-full h-32 bg-slate-900/50 p-2 overflow-y-auto font-mono text-xs">
            {logs.map((log) => (
                <div key={log.id} className="mb-1">
                    <span className={log.sender === 'COMMAND' ? 'text-cyan-400' : 'text-slate-400'}>[{log.sender}]</span>: <span className="text-slate-200">{log.message}</span>
                </div>
            ))}
             <div ref={messagesEndRef} />
        </div>

      </div>
      
      {/* Footer Instructions */}
      <div className="fixed bottom-4 text-center w-full text-slate-500 text-xs font-mono pointer-events-none">
          CONTROLS: MOUSE TO MOVE • [B] ARMORY • [P] PAUSE
      </div>

    </div>
  );
}
