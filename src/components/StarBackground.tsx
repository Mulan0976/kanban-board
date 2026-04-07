import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import p5 from 'p5';
import { Settings, X, ChevronDown, Copy, Check } from 'lucide-react';

(window as any).THREE = THREE;
(window as any).p5 = p5;

// ---------------------------------------------------------------------------
// Effect registry - only fog, cells, ripple, topology, trunk
// ---------------------------------------------------------------------------

interface ParamDef {
  key: string;
  label: string;
  type: 'color' | 'slider';
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number | string;
}

interface EffectDef {
  name: string;
  loader: () => Promise<any>;
  params: ParamDef[];
  usesP5?: boolean; // topology & trunk use p5.js instead of THREE
}

// Per-effect default opacities
const EFFECT_DEFAULT_OPACITY: Record<string, number> = {
  cells: 0.4,
  fog: 0.4,
  ripple: 0.3,
  topology: 0.75,
};

const EFFECTS: Record<string, EffectDef> = {
  cells: {
    name: 'Cells',
    loader: () => import('vanta/dist/vanta.cells.min'),
    params: [
      { key: 'backgroundColor', label: 'Background', type: 'color', defaultValue: '#000000' },
      { key: 'color1', label: 'Color 1', type: 'color', defaultValue: '#020d09' },
      { key: 'color2', label: 'Color 2', type: 'color', defaultValue: '#13956e' },
      { key: 'size', label: 'Size', type: 'slider', min: 0.5, max: 20, step: 0.5, defaultValue: 3 },
      { key: 'speed', label: 'Speed', type: 'slider', min: 0, max: 5, step: 0.1, defaultValue: 0.7 },
      { key: 'amplitudeFactor', label: 'Amplitude', type: 'slider', min: 0, max: 5, step: 0.1, defaultValue: 2.4 },
      { key: 'ringFactor', label: 'Ring Factor', type: 'slider', min: 0, max: 5, step: 0.1, defaultValue: 0.6 },
      { key: 'rotationFactor', label: 'Rotation', type: 'slider', min: 0, max: 5, step: 0.1, defaultValue: 2.4 },
    ],
  },
  fog: {
    name: 'Fog',
    loader: () => import('vanta/dist/vanta.fog.min'),
    params: [
      { key: 'baseColor', label: 'Base Color', type: 'color', defaultValue: '#000000' },
      { key: 'highlightColor', label: 'Highlight', type: 'color', defaultValue: '#099079' },
      { key: 'midtoneColor', label: 'Midtone', type: 'color', defaultValue: '#1cd99a' },
      { key: 'lowlightColor', label: 'Lowlight', type: 'color', defaultValue: '#064e3b' },
      { key: 'blurFactor', label: 'Blur', type: 'slider', min: 0.1, max: 1, step: 0.05, defaultValue: 0.55 },
      { key: 'speed', label: 'Speed', type: 'slider', min: 0, max: 5, step: 0.1, defaultValue: 0.4 },
      { key: 'zoom', label: 'Zoom', type: 'slider', min: 0.1, max: 3, step: 0.1, defaultValue: 0.9 },
    ],
  },
  ripple: {
    name: 'Ripple',
    loader: () => import('vanta/dist/vanta.ripple.min'),
    params: [
      { key: 'backgroundColor', label: 'Background', type: 'color', defaultValue: '#162801' },
      { key: 'color1', label: 'Color 1', type: 'color', defaultValue: '#73f7c4' },
      { key: 'color2', label: 'Color 2', type: 'color', defaultValue: '#18817f' },
      { key: 'speed', label: 'Speed', type: 'slider', min: 0, max: 5, step: 0.1, defaultValue: 0.3 },
      { key: 'amplitudeFactor', label: 'Amplitude', type: 'slider', min: 0, max: 5, step: 0.1, defaultValue: 3.1 },
      { key: 'ringFactor', label: 'Ring Factor', type: 'slider', min: 0, max: 10, step: 0.5, defaultValue: 1.5 },
      { key: 'rotationFactor', label: 'Rotation', type: 'slider', min: 0, max: 5, step: 0.1, defaultValue: 1 },
    ],
  },
  topology: {
    name: 'Topology',
    loader: () => import('vanta/dist/vanta.topology.min'),
    usesP5: true,
    params: [
      { key: 'backgroundColor', label: 'Background', type: 'color', defaultValue: '#050505' },
      { key: 'color', label: 'Color', type: 'color', defaultValue: '#22c55e' },
      { key: 'scale', label: 'Scale', type: 'slider', min: 0.5, max: 5, step: 0.1, defaultValue: 1 },
    ],
  },
};

const EFFECT_KEYS = Object.keys(EFFECTS);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'vanta-bg-v2';

interface SavedState {
  effect: string;
  paramsByEffect: Record<string, Record<string, number | string>>;
  opacity: number;
}

function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

function intToHex(n: number): string {
  return '#' + ('000000' + n.toString(16)).slice(-6);
}

function loadState(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        effect: parsed.effect || 'cells',
        paramsByEffect: parsed.paramsByEffect || {},
        opacity: parsed.opacity ?? 0.75,
      };
    }
  } catch {}
  return { effect: 'cells', paramsByEffect: {}, opacity: 0.4 };
}

function saveState(s: SavedState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

function getParamValues(effectKey: string, overrides: Record<string, number | string>): Record<string, any> {
  const def = EFFECTS[effectKey];
  if (!def) return {};
  const result: Record<string, any> = {};
  for (const p of def.params) {
    const val = overrides[p.key] ?? p.defaultValue;
    if (p.type === 'color') {
      result[p.key] = hexToInt(val as string);
    } else {
      result[p.key] = val;
    }
  }
  return result;
}

function getDisplayValue(effectKey: string, paramKey: string, overrides: Record<string, number | string>): number | string {
  const def = EFFECTS[effectKey];
  if (!def) return '';
  const p = def.params.find((x) => x.key === paramKey);
  if (!p) return '';
  return overrides[paramKey] ?? p.defaultValue;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Isolated canvas - never re-renders from parent state changes
const VantaCanvas = React.memo(function VantaCanvas({
  effectKey, opacity, stateRef
}: {
  effectKey: string; opacity: number; stateRef: React.MutableRefObject<SavedState>;
}) {
  const vantaRef = useRef<HTMLDivElement>(null);
  const vantaEffect = useRef<any>(null);

  useEffect(() => {
    const el = vantaRef.current;
    if (!el) return;
    let alive = true;

    const create = async () => {
      const def = EFFECTS[effectKey] || EFFECTS.cells;
      const s = stateRef.current;
      const effectParams = (s.paramsByEffect || {})[s.effect] || {};
      try {
        const mod = await def.loader();
        if (!alive || !vantaRef.current) return;
        const fn = mod.default || mod;
        const opts: Record<string, any> = {
          el: vantaRef.current,
          ...getParamValues(s.effect, effectParams),
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200,
          minWidth: 200,
        };
        // p5-based effects (topology, trunk) need p5, not THREE
        if (def.usesP5) {
          opts.p5 = p5;
        } else {
          opts.THREE = THREE;
          opts.scale = 0.6;
          opts.scaleMobile = 3;
        }
        vantaEffect.current = fn(opts);
      } catch (e) {
        console.warn(`Vanta ${effectKey} failed:`, e);
      }
    };

    create();

    return () => {
      alive = false;
      if (vantaEffect.current) {
        try { vantaEffect.current.destroy(); } catch {}
        vantaEffect.current = null;
      }
    };
  }, [effectKey, stateRef]);

  // Expose setOptions for live param updates
  useEffect(() => {
    (window as any).__vantaSetOptions = (opts: Record<string, any>) => {
      if (vantaEffect.current) {
        try { vantaEffect.current.setOptions(opts); } catch {}
      }
    };
    return () => { delete (window as any).__vantaSetOptions; };
  }, []);

  return (
    <div
      ref={vantaRef}
      style={{
        position: 'fixed', top: 0, left: 0,
        width: '100vw', height: '100vh', zIndex: 0,
        opacity,
        transition: 'opacity 0.4s ease',
      }}
    />
  );
});

export default function StarBackground() {
  const [state, setState] = useState<SavedState>(loadState);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [effectDropdownOpen, setEffectDropdownOpen] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const effectKey = state.effect;
  const effectDef = EFFECTS[effectKey] || EFFECTS.cells;

  useEffect(() => { saveState(state); }, [state]);

  // Live-update params without recreating
  const updateParam = (key: string, value: number | string) => {
    setState((prev) => {
      const pbe = prev.paramsByEffect || {};
      const effectParams = { ...(pbe[prev.effect] || {}), [key]: value };
      return { ...prev, paramsByEffect: { ...pbe, [prev.effect]: effectParams } };
    });
    // Live-update via window bridge
    const p = effectDef.params.find((x) => x.key === key);
    if (p && (window as any).__vantaSetOptions) {
      const opt: Record<string, any> = {};
      opt[key] = p.type === 'color' ? hexToInt(value as string) : value;
      (window as any).__vantaSetOptions(opt);
    }
  };

  const switchEffect = (newEffect: string) => {
    setState((prev) => ({
      ...prev,
      effect: newEffect,
      opacity: EFFECT_DEFAULT_OPACITY[newEffect] ?? 0.5,
    }));
    setEffectDropdownOpen(false);
  };

  const [copied, setCopied] = useState(false);
  const copySettings = () => {
    const effectParams = (state.paramsByEffect || {})[effectKey] || {};
    const allParams: Record<string, any> = {};
    for (const p of effectDef.params) {
      const val = effectParams[p.key] ?? p.defaultValue;
      allParams[p.key] = p.type === 'color' ? hexToInt(val as string) : val;
    }
    const output = { effect: effectKey, opacity: state.opacity, ...allParams };
    navigator.clipboard.writeText(JSON.stringify(output, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const emerald = '#10b981';

  return (
    <>
      {/* Vanta container - isolated component, won't re-render from UI state */}
      <VantaCanvas effectKey={effectKey} opacity={state.opacity} stateRef={stateRef} />

      {/* Glow orbs */}
      <div className="fixed pointer-events-none" style={{ zIndex: 1, top: '-8%', left: '-3%', width: '50vw', height: '50vh', background: 'radial-gradient(ellipse at center, rgba(34,197,94,0.06) 0%, rgba(34,197,94,0.02) 40%, transparent 70%)', filter: 'blur(60px)' }} />
      <div className="fixed pointer-events-none" style={{ zIndex: 1, bottom: '-8%', right: '-3%', width: '45vw', height: '45vh', background: 'radial-gradient(ellipse at center, rgba(16,185,129,0.04) 0%, rgba(16,185,129,0.01) 40%, transparent 70%)', filter: 'blur(60px)' }} />

      {/* Gear toggle */}
      <button
        onClick={() => setPickerOpen((o) => !o)}
        title="Background settings"
        style={{
          position: 'fixed', bottom: 68, right: 16, zIndex: 9998,
          width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: pickerOpen ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)',
          border: pickerOpen ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, color: pickerOpen ? emerald : 'rgba(255,255,255,0.5)',
          cursor: 'pointer', backdropFilter: 'blur(20px)', transition: 'all 0.2s',
        }}
      >
        <Settings size={15} />
      </button>

      {/* Picker panel */}
      {pickerOpen && (
        <div style={{
          position: 'fixed', bottom: 108, right: 16, zIndex: 9998, width: 290,
          maxHeight: 'calc(100vh - 140px)', overflowY: 'auto',
          background: 'rgba(10,10,10,0.94)', backdropFilter: 'blur(30px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14,
          padding: '14px 16px 12px', color: '#fff', fontFamily: "'Syne', sans-serif",
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: 'rgba(255,255,255,0.85)' }}>Background</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button onClick={copySettings} title="Copy settings" style={{ background: 'none', border: 'none', color: copied ? emerald : 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 4, display: 'flex', transition: 'color 0.2s' }}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
              <button onClick={() => setPickerOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 4, display: 'flex' }}>
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Effect dropdown */}
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Effect</div>
            <button
              onClick={() => setEffectDropdownOpen(!effectDropdownOpen)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: 13, cursor: 'pointer', textTransform: 'capitalize' }}
            >
              {effectDef.name}
              <ChevronDown size={14} style={{ opacity: 0.5, transform: effectDropdownOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
            </button>
            {effectDropdownOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 5 }} onClick={() => setEffectDropdownOpen(false)} />
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, maxHeight: 220, overflowY: 'auto', background: 'rgba(10,10,10,0.98)', backdropFilter: 'blur(30px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, zIndex: 10, padding: '3px 0' }}>
                  {EFFECT_KEYS.map((key) => (
                    <button
                      key={key}
                      onClick={() => switchEffect(key)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', fontSize: 12, textTransform: 'capitalize', color: key === effectKey ? emerald : 'rgba(255,255,255,0.7)', background: key === effectKey ? 'rgba(16,185,129,0.1)' : 'transparent', border: 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => { if (key !== effectKey) (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                      onMouseLeave={(e) => { (e.target as HTMLElement).style.background = key === effectKey ? 'rgba(16,185,129,0.1)' : 'transparent'; }}
                    >
                      {EFFECTS[key].name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Overall opacity */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Opacity</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>{state.opacity.toFixed(2)}</span>
            </div>
            <input type="range" min={0} max={1} step={0.05} value={state.opacity} onChange={(e) => setState((p) => ({ ...p, opacity: parseFloat(e.target.value) }))} style={{ width: '100%', accentColor: emerald, height: 4 }} />
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '10px 0' }} />

          {/* Per-effect params */}
          {effectDef.params.map((p) => {
            const val = getDisplayValue(effectKey, p.key, (state.paramsByEffect || {})[effectKey] || {});
            if (p.type === 'color') {
              return (
                <div key={p.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{p.label}</span>
                  <input type="color" value={val as string} onChange={(e) => updateParam(p.key, e.target.value)} style={{ width: 36, height: 22, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, background: 'transparent', cursor: 'pointer', padding: 0 }} />
                </div>
              );
            }
            return (
              <div key={p.key} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{p.label}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>{Number(val).toFixed(p.step! < 1 ? 1 : 0)}</span>
                </div>
                <input type="range" min={p.min} max={p.max} step={p.step} value={val as number} onChange={(e) => updateParam(p.key, parseFloat(e.target.value))} style={{ width: '100%', accentColor: emerald, height: 4 }} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
