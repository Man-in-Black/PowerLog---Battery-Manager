
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Battery, BatteryCategory, ChargingEvent } from './types';
import { BatteryIcon, ZapIcon, PlusIcon, AlertIcon, HistoryIcon, UseIcon, GlobeIcon } from './components/Icons';
import { translations, Language } from './translations';

type Theme = 'light' | 'dark' | 'system';

// Robuste ID Generierung (Fallback für Non-HTTPS Umgebungen)
const generateSafeId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Manueller Fallback
  return 'idx-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
};

const App: React.FC = () => {
  const [batteries, setBatteries] = useState<Battery[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('system');
  const [chargeModal, setChargeModal] = useState<{ isOpen: boolean; batteryId: string; amount: number }>({ isOpen: false, batteryId: '', amount: 1 });
  const [historyModal, setHistoryModal] = useState<{ isOpen: boolean; batteryId: string }>({ isOpen: false, batteryId: '' });
  const [lang, setLang] = useState<Language>('de');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Battery, direction: 'asc' | 'desc' }>({ key: 'category', direction: 'asc' });
  const [filterCategory, setFilterCategory] = useState<BatteryCategory | 'ALL'>('ALL');
  
  const t = translations[lang];
  
  const langMenuRefMobile = useRef<HTMLDivElement>(null);
  const themeMenuRefMobile = useRef<HTMLDivElement>(null);
  const langMenuRefDesktop = useRef<HTMLDivElement>(null);
  const themeMenuRefDesktop = useRef<HTMLDivElement>(null);

  const [formBattery, setFormBattery] = useState<Partial<Battery>>({
    name: '', brand: '', size: '', category: BatteryCategory.PRIMARY, quantity: 1, totalQuantity: 1, inUse: 0, minQuantity: 2, capacityMah: 0, chargeCycles: 0, usageAccumulator: 0, chargingHistory: []
  });

  // Theme Logic
  useEffect(() => {
    const savedTheme = localStorage.getItem('powerlog_theme') as Theme || 'system';
    setTheme(savedTheme);
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    const applyTheme = (current: Theme) => {
      root.classList.remove('light', 'dark');
      if (current === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.classList.add(systemTheme);
      } else {
        root.classList.add(current);
      }
    };

    applyTheme(theme);
    localStorage.setItem('powerlog_theme', theme);

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme('system');
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  // Data Persistence Service
  const fetchBatteries = async () => {
    try {
      const res = await fetch('/api/batteries');
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      setBatteries(Array.isArray(data) ? data : []);
      localStorage.setItem('powerlog_batteries', JSON.stringify(data));
    } catch (e) {
      console.warn("API nicht erreichbar, nutze lokales Backup.", e);
      const localData = localStorage.getItem('powerlog_batteries');
      if (localData) setBatteries(JSON.parse(localData));
    } finally {
      setIsLoading(false);
    }
  };

  const saveToStorage = async (battery: Battery) => {
    // 1. Lokale Liste berechnen
    let updatedList: Battery[] = [];
    setBatteries(prev => {
      const exists = prev.find(b => b.id === battery.id);
      if (exists) {
        updatedList = prev.map(b => b.id === battery.id ? battery : b);
      } else {
        updatedList = [...prev, battery];
      }
      // 2. Local Backup synchronisieren
      localStorage.setItem('powerlog_batteries', JSON.stringify(updatedList));
      return updatedList;
    });

    // 3. API Synchronisation (immer versuchen)
    try {
      const res = await fetch('/api/batteries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(battery)
      });
      if (!res.ok) throw new Error("API Save Failed");
    } catch (e) {
      console.error("API Sync fehlgeschlagen, Daten sind nur lokal gespeichert.", e);
    }
  };

  const deleteFromStorage = async (id: string) => {
    setBatteries(prev => {
      const updatedList = prev.filter(b => b.id !== id);
      localStorage.setItem('powerlog_batteries', JSON.stringify(updatedList));
      return updatedList;
    });

    try {
      const res = await fetch(`/api/batteries/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("API Delete Failed");
    } catch (e) {
      console.error("API Delete Sync fehlgeschlagen:", e);
    }
  };

  useEffect(() => {
    fetchBatteries();
    const savedLang = localStorage.getItem('powerlog_lang');
    if (savedLang === 'de' || savedLang === 'en') setLang(savedLang as Language);

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isOutsideLang = 
        (!langMenuRefMobile.current || !langMenuRefMobile.current.contains(target)) &&
        (!langMenuRefDesktop.current || !langMenuRefDesktop.current.contains(target));
      const isOutsideTheme = 
        (!themeMenuRefMobile.current || !themeMenuRefMobile.current.contains(target)) &&
        (!themeMenuRefDesktop.current || !themeMenuRefDesktop.current.contains(target));
      if (isOutsideLang) setIsLangMenuOpen(false);
      if (isOutsideTheme) setIsThemeMenuOpen(false);
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const requestSort = (key: keyof Battery) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredAndSortedBatteries = useMemo(() => {
    let result = [...batteries];
    if (filterCategory !== 'ALL') {
      result = result.filter(b => b.category === filterCategory);
    }
    result.sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const comp = aVal.localeCompare(bVal);
        return sortConfig.direction === 'asc' ? comp : -comp;
      }
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [batteries, sortConfig, filterCategory]);

  const saveBattery = async () => {
    if (!formBattery.name) return;
    const isRechargeable = formBattery.category === BatteryCategory.RECHARGEABLE;
    const battery: Battery = {
      id: formBattery.id || generateSafeId(),
      name: formBattery.name || '?',
      brand: formBattery.brand || '',
      size: formBattery.size || formBattery.name || 'AA',
      category: (formBattery.category as BatteryCategory) || BatteryCategory.PRIMARY,
      quantity: Number(formBattery.quantity) || 0,
      totalQuantity: isRechargeable ? Number(formBattery.totalQuantity || 1) : Number(formBattery.quantity || 1),
      inUse: isRechargeable ? (Number(formBattery.inUse) || 0) : 0,
      minQuantity: Number(formBattery.minQuantity) || 0,
      usageAccumulator: Number(formBattery.usageAccumulator || 0),
      capacityMah: isRechargeable ? Number(formBattery.capacityMah) : undefined,
      chargeCycles: isRechargeable ? Number(formBattery.chargeCycles || 0) : undefined,
      lastCharged: isRechargeable ? (formBattery.lastCharged || new Date().toISOString()) : undefined,
      chargingHistory: formBattery.chargingHistory || [],
    };
    await saveToStorage(battery);
    closeModal();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
    setFormBattery({ name: '', brand: '', size: '', category: BatteryCategory.PRIMARY, quantity: 1, totalQuantity: 1, inUse: 0, minQuantity: 2, chargeCycles: 0, capacityMah: 0, usageAccumulator: 0, chargingHistory: [] });
  };

  const useBattery = async (id: string) => {
    const b = batteries.find(x => x.id === id);
    if (!b || b.quantity <= 0) return;
    let updated: Battery;
    if (b.category === BatteryCategory.RECHARGEABLE) {
      let nextAccumulator = b.usageAccumulator + 1;
      let nextCycles = b.chargeCycles || 0;
      if (nextAccumulator >= (b.totalQuantity || 1)) { nextAccumulator = 0; nextCycles += 1; }
      updated = { ...b, quantity: b.quantity - 1, inUse: b.inUse + 1, usageAccumulator: nextAccumulator, chargeCycles: nextCycles };
    } else {
      updated = { ...b, quantity: b.quantity - 1, totalQuantity: Math.max(0, (b.totalQuantity || b.quantity) - 1) };
    }
    await saveToStorage(updated);
  };

  const executeCharge = async () => {
    const { batteryId, amount } = chargeModal;
    const b = batteries.find(x => x.id === batteryId);
    if (!b) return;
    const moveAmount = Math.min(b.inUse, amount);
    const now = new Date().toISOString();
    
    const newHistoryEvent: ChargingEvent = {
      id: generateSafeId(),
      date: now,
      count: moveAmount
    };

    const updated = { 
      ...b, 
      quantity: b.quantity + moveAmount, 
      inUse: b.inUse - moveAmount, 
      lastCharged: now,
      chargingHistory: [newHistoryEvent, ...(b.chargingHistory || [])]
    };
    await saveToStorage(updated);
    setChargeModal({ isOpen: false, batteryId: '', amount: 1 });
  };

  const deleteHistoryEntry = async (batteryId: string, eventId: string) => {
    const b = batteries.find(x => x.id === batteryId);
    if (!b || !b.chargingHistory) return;
    const updatedHistory = b.chargingHistory.filter(e => e.id !== eventId);
    const updated = { ...b, chargingHistory: updatedHistory };
    await saveToStorage(updated);
  };

  const SortIndicator = ({ column }: { column: keyof Battery }) => {
    if (sortConfig.key !== column) return <span className="ml-1 opacity-20">⇅</span>;
    return <span className="ml-1 text-indigo-500">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <ZapIcon className="w-12 h-12 text-amber-500 animate-pulse" />
          <p className="font-black text-slate-400 dark:text-slate-600 tracking-widest text-xs uppercase">Powering Up...</p>
        </div>
      </div>
    );
  }

  const selectedBatteryForHistory = batteries.find(b => b.id === historyModal.batteryId);

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-[1600px] mx-auto pb-24 text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
        <div className="flex items-center justify-between w-full lg:w-auto">
          <div>
            <h1 className="text-2xl md:text-4xl font-black flex items-center gap-2 tracking-tighter">
              <ZapIcon className="text-amber-500 w-8 h-8 md:w-10 md:h-10" />
              POWERLOG
            </h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium text-[10px] md:text-sm uppercase tracking-wider">{t.subtitle}</p>
          </div>
          <div className="flex items-center gap-2 lg:hidden">
            <div className="relative" ref={langMenuRefMobile}>
              <button type="button" onClick={() => { setIsLangMenuOpen(!isLangMenuOpen); setIsThemeMenuOpen(false); }} className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl shadow-sm active:scale-95 transition-transform"><GlobeIcon className="w-5 h-5" /></button>
              {isLangMenuOpen && (
                <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden z-[120] animate-in slide-in-from-top-2">
                  <button onClick={() => {setLang('de'); localStorage.setItem('powerlog_lang', 'de'); setIsLangMenuOpen(false);}} className={`w-full text-left px-4 py-3 text-xs font-black uppercase ${lang === 'de' ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-slate-800' : 'text-slate-500'}`}>Deutsch</button>
                  <button onClick={() => {setLang('en'); localStorage.setItem('powerlog_lang', 'en'); setIsLangMenuOpen(false);}} className={`w-full text-left px-4 py-3 text-xs font-black uppercase ${lang === 'en' ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-slate-800' : 'text-slate-500'}`}>English</button>
                </div>
              )}
            </div>
            <div className="relative" ref={themeMenuRefMobile}>
              <button type="button" onClick={() => { setIsThemeMenuOpen(!isThemeMenuOpen); setIsLangMenuOpen(false); }} className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl shadow-sm active:scale-95 transition-transform">{theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '🌓'}</button>
              {isThemeMenuOpen && (
                <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden z-[120] animate-in slide-in-from-top-2">
                  {(['light', 'dark', 'system'] as Theme[]).map(th => (<button key={th} onClick={() => {setTheme(th); setIsThemeMenuOpen(false);}} className={`w-full text-left px-4 py-3 text-xs font-black uppercase hover:bg-slate-50 dark:hover:bg-slate-800 ${theme === th ? 'text-indigo-600 bg-indigo-50 dark:bg-slate-800/50' : ''}`}>{th}</button>))}
                </div>
              )}
            </div>
            <button onClick={() => setIsModalOpen(true)} className="p-3 bg-indigo-600 text-white rounded-2xl shadow-xl shadow-indigo-200 dark:shadow-none active:scale-95 transition-transform"><PlusIcon className="w-6 h-6" /></button>
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-4">
          <div className="relative" ref={themeMenuRefDesktop}>
            <button onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)} className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-4 py-3 rounded-2xl text-xs font-black shadow-sm transition-all hover:scale-105">{theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '🌓'} {theme.toUpperCase()}</button>
            {isThemeMenuOpen && (
              <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden z-[110]">
                {(['light', 'dark', 'system'] as Theme[]).map(th => (<button key={th} onClick={() => {setTheme(th); setIsThemeMenuOpen(false);}} className={`w-full text-left px-4 py-4 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${theme === th ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-slate-800/50' : 'text-slate-400'}`}>{th}</button>))}
              </div>
            )}
          </div>
          <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-2xl">
            <button onClick={() => {setLang('de'); localStorage.setItem('powerlog_lang', 'de');}} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${lang === 'de' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}>DE</button>
            <button onClick={() => {setLang('en'); localStorage.setItem('powerlog_lang', 'en');}} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${lang === 'en' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}>EN</button>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl transition-all font-black shadow-xl shadow-indigo-100 dark:shadow-none active:scale-95"><PlusIcon /> {t.add}</button>
        </div>
      </header>

      {/* Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-8 mb-12">
        <div className="bg-white dark:bg-slate-900 p-5 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-4 transition-colors">
          <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 md:p-4 rounded-2xl text-indigo-600 dark:text-indigo-400 shrink-0"><BatteryIcon className="w-6 h-6 md:w-8 md:h-8" /></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 truncate">{t.totalInventory}</p>
            <p className="text-xl md:text-3xl font-black">{batteries.reduce((a,b)=>a+(b.totalQuantity || 0), 0)} <span className="text-xs md:text-sm font-bold text-slate-400">{t.pcs}</span></p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-4 transition-colors">
          <div className="bg-rose-50 dark:bg-rose-900/30 p-3 md:p-4 rounded-2xl text-rose-600 dark:text-rose-400 shrink-0"><AlertIcon className="w-6 h-6 md:w-8 md:h-8" /></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 truncate">{t.lowStock}</p>
            <p className="text-xl md:text-3xl font-black">{batteries.filter(b => b.quantity <= b.minQuantity).length} <span className="text-xs md:text-sm font-bold text-slate-400">{t.types}</span></p>
          </div>
        </div>
        <div className="col-span-2 lg:col-span-1 bg-white dark:bg-slate-900 p-5 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-4 transition-colors">
          <div className="bg-emerald-50 dark:bg-emerald-900/30 p-3 md:p-4 rounded-2xl text-emerald-600 dark:text-emerald-400 shrink-0"><HistoryIcon className="w-6 h-6 md:w-8 md:h-8" /></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 truncate">{t.statusReady}</p>
            <p className="text-xl md:text-3xl font-black">{batteries.reduce((a,b)=>a+(b.quantity || 0), 0)} <span className="text-xs md:text-sm font-bold text-slate-400">{t.pcs}</span></p>
          </div>
        </div>
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-8">
        {['ALL', BatteryCategory.PRIMARY, BatteryCategory.BUTTON_CELL, BatteryCategory.RECHARGEABLE].map(cat => (
          <button 
            key={cat}
            onClick={() => setFilterCategory(cat as any)} 
            className={`px-5 py-2.5 rounded-2xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${filterCategory === cat ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-800 hover:border-indigo-200'}`}
          >
            {cat === 'ALL' ? t.filterAll : cat === BatteryCategory.PRIMARY ? t.catPrimary : cat === BatteryCategory.BUTTON_CELL ? t.catButton : t.catRechargeable}
          </button>
        ))}
      </div>

      {/* Main Table (Desktop / Large Tablets) */}
      <div className="hidden lg:block bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="no-scrollbar">
          <table className="w-full text-left border-collapse table-auto">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 transition-colors">
                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors group select-none" onClick={() => requestSort('category')}>
                  <div className="flex items-center">{t.colArt} <SortIndicator column="category" /></div>
                </th>
                <th className="p-6 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors group select-none" onClick={() => requestSort('name')}>
                  <div className="flex items-center justify-center">{t.colTyp} <SortIndicator column="name" /></div>
                </th>
                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors group select-none" onClick={() => requestSort('brand')}>
                  <div className="flex items-center">{t.colHersteller} <SortIndicator column="brand" /></div>
                </th>
                <th className="p-6 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors group select-none" onClick={() => requestSort('capacityMah')}>
                   <div className="flex items-center justify-center">{t.colLeistung} <SortIndicator column="capacityMah" /></div>
                </th>
                <th className="p-6 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors group select-none" onClick={() => requestSort('totalQuantity')}>
                  <div className="flex items-center justify-center">{t.colGesamt} <SortIndicator column="totalQuantity" /></div>
                </th>
                <th className="p-6 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors group select-none" onClick={() => requestSort('quantity')}>
                  <div className="flex items-center justify-center">{t.colMenge} <SortIndicator column="quantity" /></div>
                </th>
                <th className="p-6 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors group select-none" onClick={() => requestSort('inUse')}>
                  <div className="flex items-center justify-center">{t.colEinsatz} <SortIndicator column="inUse" /></div>
                </th>
                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400">{t.cycleProgress}</th>
                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">{t.colAktionen}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800 transition-colors">
              {filteredAndSortedBatteries.map(battery => (
                <tr key={battery.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                  <td className="p-6">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full ${battery.category === BatteryCategory.RECHARGEABLE ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : battery.category === BatteryCategory.BUTTON_CELL ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                      {battery.category === BatteryCategory.RECHARGEABLE ? t.catRechargeable : battery.category === BatteryCategory.BUTTON_CELL ? t.catButton : t.catPrimary}
                    </span>
                  </td>
                  <td className="p-6 text-center"><span className="font-black text-slate-800 dark:text-slate-200 tracking-tight text-lg">{battery.name}</span></td>
                  <td className="p-6"><span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{battery.brand || '—'}</span></td>
                  <td className="p-6 text-center font-bold text-slate-500 dark:text-slate-400">{battery.capacityMah ? `${battery.capacityMah} mAh` : '—'}</td>
                  <td className="p-6 text-center font-bold text-slate-400 dark:text-slate-600">{battery.totalQuantity}</td>
                  <td className="p-6 text-center"><span className={`text-2xl font-black ${battery.quantity <= battery.minQuantity ? 'text-rose-500' : 'text-emerald-500'}`}>{battery.quantity}</span></td>
                  <td className="p-6 text-center"><span className={`text-2xl font-black ${battery.inUse > 0 ? 'text-indigo-500' : 'text-slate-300 dark:text-slate-700'}`}>{battery.inUse}</span></td>
                  <td className="p-6">
                    {battery.category === BatteryCategory.RECHARGEABLE ? (
                      <div className="w-full max-w-[180px]">
                        <div className="flex justify-between items-end mb-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t.colZyklen}: {battery.chargeCycles}</span>
                          <span className="text-[10px] font-black text-indigo-500">{Math.round(((battery.usageAccumulator || 0) / (battery.totalQuantity || 1)) * 100)}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden transition-colors">
                          <div className="h-full bg-indigo-500 transition-all duration-700" style={{ width: `${((battery.usageAccumulator || 0) / (battery.totalQuantity || 1)) * 100}%` }}></div>
                        </div>
                      </div>
                    ) : <span className="text-[10px] text-slate-300 dark:text-slate-700 font-bold uppercase">—</span>}
                  </td>
                  <td className="p-6">
                    <div className="flex items-center justify-center gap-2 transition-opacity">
                      {battery.category === BatteryCategory.RECHARGEABLE && (
                        <>
                          <button onClick={() => setHistoryModal({ isOpen: true, batteryId: battery.id })} className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"><HistoryIcon className="w-5 h-5" /></button>
                          <button onClick={() => setChargeModal({ isOpen: true, batteryId: battery.id, amount: battery.inUse || 0 })} disabled={!battery.inUse} className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-2xl hover:bg-amber-500 hover:text-white transition-all disabled:opacity-30"><ZapIcon className="w-5 h-5" /></button>
                        </>
                      )}
                      <button onClick={() => useBattery(battery.id)} disabled={battery.quantity === 0} className="p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all disabled:opacity-30"><UseIcon /></button>
                      <button onClick={() => { setFormBattery(battery); setIsEditMode(true); setIsModalOpen(true); }} className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                      <button onClick={() => deleteFromStorage(battery.id)} className="p-3 bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-400 rounded-2xl hover:bg-rose-500 hover:text-white transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cards (Mobile / Small Tablets) */}
      <div className="lg:hidden space-y-6">
        {filteredAndSortedBatteries.map(battery => (
          <div key={battery.id} className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 space-y-5 transition-colors">
            <div className="flex justify-between items-start">
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  {battery.category === BatteryCategory.RECHARGEABLE ? t.catRechargeable : battery.category === BatteryCategory.BUTTON_CELL ? t.catButton : t.catPrimary}
                </span>
                <span className="font-black text-slate-800 dark:text-slate-100 text-xl leading-tight">{battery.name}</span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-2">
                  {battery.brand && <div className="flex items-center gap-1.5"><span className="text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase">{t.colHersteller}:</span><span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{battery.brand}</span></div>}
                  {battery.capacityMah && <div className="flex items-center gap-1.5"><span className="text-[9px] font-black text-indigo-400 uppercase">mAh:</span><span className="text-xs font-black text-indigo-500 uppercase tracking-wider bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-lg">{battery.capacityMah}</span></div>}
                </div>
              </div>
              <div className="flex gap-2">
                {battery.category === BatteryCategory.RECHARGEABLE && (
                  <button onClick={() => setHistoryModal({ isOpen: true, batteryId: battery.id })} className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-2xl active:bg-slate-200"><HistoryIcon className="w-5 h-5" /></button>
                )}
                <button onClick={() => { setFormBattery(battery); setIsEditMode(true); setIsModalOpen(true); }} className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-2xl active:bg-slate-200"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                <button onClick={() => deleteFromStorage(battery.id)} className="p-3 bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-400 rounded-2xl active:bg-rose-500 active:text-white transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 py-5 border-y border-slate-50 dark:border-slate-800 transition-colors">
              <div className="text-center"><p className="text-[9px] font-black uppercase text-slate-400 mb-1.5">{t.statusTotal}</p><p className="font-bold text-slate-500">{battery.totalQuantity}</p></div>
              <div className="text-center"><p className="text-[9px] font-black uppercase text-slate-400 mb-1.5">{t.statusReady}</p><p className={`text-2xl font-black ${battery.quantity <= battery.minQuantity ? 'text-rose-500' : 'text-emerald-500'}`}>{battery.quantity}</p></div>
              <div className="text-center"><p className="text-[9px] font-black uppercase text-slate-400 mb-1.5">{t.statusInUse}</p><p className={`text-2xl font-black ${battery.inUse > 0 ? 'text-indigo-500' : 'text-slate-300 dark:text-slate-700'}`}>{battery.inUse}</p></div>
            </div>
            {battery.category === BatteryCategory.RECHARGEABLE && (
              <div className="py-2">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t.colZyklen}: {battery.chargeCycles}</span>
                  <span className="text-[10px] font-black text-indigo-500">{Math.round(((battery.usageAccumulator || 0) / (battery.totalQuantity || 1)) * 100)}%</span>
                </div>
                <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 transition-all duration-700" style={{ width: `${((battery.usageAccumulator || 0) / (battery.totalQuantity || 1)) * 100}%` }}></div>
                </div>
              </div>
            )}
            <div className="flex gap-4 pt-2">
              <button onClick={() => useBattery(battery.id)} disabled={battery.quantity === 0} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 active:scale-95 disabled:opacity-30"><UseIcon className="w-5 h-5" /> {t.btnUse}</button>
              {battery.category === BatteryCategory.RECHARGEABLE && (
                <button onClick={() => setChargeModal({ isOpen: true, batteryId: battery.id, amount: battery.inUse || 0 })} disabled={!battery.inUse} className="flex-1 py-4 bg-amber-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 active:scale-95 disabled:opacity-30"><ZapIcon className="w-5 h-5" /> {t.logCharge}</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Charging History Modal */}
      {historyModal.isOpen && selectedBatteryForHistory && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl z-[200] flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-t-[3rem] md:rounded-[3rem] shadow-2xl w-full max-w-lg p-8 animate-in slide-in-from-bottom md:zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-3xl font-black text-slate-900 dark:text-slate-100">{t.historyTitle}</h3>
              <button onClick={() => setHistoryModal({ isOpen: false, batteryId: '' })} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-400">✕</button>
            </div>
            <p className="text-xs font-black text-indigo-500 uppercase tracking-widest mb-6">{selectedBatteryForHistory.brand} {selectedBatteryForHistory.name}</p>
            
            <div className="overflow-y-auto pr-2 custom-scrollbar flex-1">
              {!selectedBatteryForHistory.chargingHistory || selectedBatteryForHistory.chargingHistory.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-slate-400 font-bold italic">{t.historyEmpty}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedBatteryForHistory.chargingHistory.map(event => (
                    <div key={event.id} className="group flex items-center justify-between p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 transition-all hover:border-indigo-200">
                      <div>
                        <p className="text-[11px] font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide">
                          {t.historyEntry.replace('{{count}}', event.count.toString()).replace('{{date}}', formatDateTime(event.date))}
                        </p>
                      </div>
                      <button 
                        onClick={() => deleteHistoryEntry(selectedBatteryForHistory.id, event.id)} 
                        className="p-2.5 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500 hover:text-white"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="mt-8">
              <button onClick={() => setHistoryModal({ isOpen: false, batteryId: '' })} className="w-full py-5 rounded-2xl bg-indigo-600 text-white font-black shadow-lg hover:bg-indigo-700 transition-colors uppercase tracking-widest text-[11px]">{t.btnConfirmCharge}</button>
            </div>
          </div>
        </div>
      )}

      {/* Charge Modal */}
      {chargeModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl z-[200] flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-t-[3rem] md:rounded-[3rem] shadow-2xl w-full max-w-sm p-8 animate-in slide-in-from-bottom md:zoom-in-95 duration-200">
            <h3 className="text-3xl font-black mb-2 text-slate-900 dark:text-slate-100 text-center md:text-left">{t.chargeHowMany}</h3>
            <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-10 text-center md:text-left">{t.statusInUse}: {batteries.find(b => b.id === chargeModal.batteryId)?.inUse} {t.pcs}</p>
            <div className="flex items-center justify-center gap-10 mb-12">
               <button onClick={() => setChargeModal(p => ({ ...p, amount: Math.max(1, p.amount - 1) }))} className="w-16 h-16 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-2xl text-3xl font-black hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">-</button>
               <span className="text-7xl font-black text-indigo-600 tabular-nums">{chargeModal.amount}</span>
               <button onClick={() => { const max = batteries.find(b => b.id === chargeModal.batteryId)?.inUse || 1; setChargeModal(p => ({ ...p, amount: Math.min(max, p.amount + 1) })); }} className="w-16 h-16 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-2xl text-3xl font-black hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">+</button>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setChargeModal({ isOpen: false, batteryId: '', amount: 1 })} className="flex-1 py-5 rounded-2xl border border-slate-200 dark:border-slate-800 font-black text-slate-500 dark:text-slate-400 transition-colors uppercase tracking-widest text-[11px]">{t.btnCancel}</button>
              <button onClick={executeCharge} className="flex-1 py-5 rounded-2xl bg-indigo-600 text-white font-black shadow-lg hover:bg-indigo-700 transition-colors uppercase tracking-widest text-[11px]">{t.btnConfirmCharge}</button>
            </div>
          </div>
        </div>
      )}

      {/* Entry Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl z-[200] flex items-end md:items-center justify-center p-0 md:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-t-[3rem] md:rounded-[4rem] shadow-2xl w-full max-w-lg my-auto p-8 md:p-12 animate-in slide-in-from-bottom md:zoom-in-95 duration-200 transition-colors">
            <h2 className="text-3xl md:text-4xl font-black mb-10 text-slate-900 dark:text-slate-100 tracking-tighter text-center md:text-left">{isEditMode ? t.editEntry : t.addNew}</h2>
            <div className="space-y-6 md:space-y-8 max-h-[60vh] overflow-y-auto px-1">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-[0.25em] text-slate-400 mb-4">{t.labelCategory}</label>
                <div className="grid grid-cols-3 gap-3">
                  {[BatteryCategory.PRIMARY, BatteryCategory.BUTTON_CELL, BatteryCategory.RECHARGEABLE].map(cat => (
                    <button key={cat} onClick={() => setFormBattery({...formBattery, category: cat})} className={`py-4 rounded-2xl border-2 text-[11px] font-black uppercase transition-all ${formBattery.category === cat ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl' : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-100 dark:border-slate-700 hover:border-indigo-200'}`}>{cat === BatteryCategory.PRIMARY ? t.catPrimary : cat === BatteryCategory.BUTTON_CELL ? t.catButton : t.catRechargeable}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><label className="block text-[11px] font-black uppercase tracking-[0.25em] text-slate-400 mb-3">{t.labelName}</label><input type="text" placeholder={t.placeholderName} className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border-0 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-700" value={formBattery.name || ''} onChange={e => setFormBattery({...formBattery, name: e.target.value})} /></div>
                <div><label className="block text-[11px] font-black uppercase tracking-[0.25em] text-slate-400 mb-3">{t.labelBrand}</label><input type="text" placeholder={t.placeholderBrand} className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border-0 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-700" value={formBattery.brand || ''} onChange={e => setFormBattery({...formBattery, brand: e.target.value})} /></div>
              </div>
              {formBattery.category === BatteryCategory.RECHARGEABLE ? (
                <div className="space-y-6 p-8 bg-indigo-50/40 dark:bg-indigo-900/10 rounded-[2.5rem] border border-indigo-100 dark:border-indigo-900/30">
                  <div className="grid grid-cols-2 gap-6">
                    <div><label className="block text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-3">{t.labelCapacity}</label><input type="number" className="w-full px-5 py-4 bg-white dark:bg-slate-800 border-0 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 font-black text-base dark:text-slate-100" value={formBattery.capacityMah || 0} onChange={e => setFormBattery({...formBattery, capacityMah: Number(e.target.value)})} /></div>
                    <div><label className="block text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-3">{t.cycles}</label><input type="number" className="w-full px-5 py-4 bg-white dark:bg-slate-800 border-0 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 font-black text-base dark:text-slate-100" value={formBattery.chargeCycles || 0} onChange={e => setFormBattery({...formBattery, chargeCycles: Number(e.target.value)})} /></div>
                    <div><label className="block text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-3">{t.labelTotal}</label><input type="number" className="w-full px-5 py-4 bg-white dark:bg-slate-800 border-0 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 font-black text-base dark:text-slate-100" value={formBattery.totalQuantity || 0} onChange={e => setFormBattery({...formBattery, totalQuantity: Number(e.target.value)})} /></div>
                    <div><label className="block text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-3">{t.labelQuantity}</label><input type="number" className="w-full px-5 py-4 bg-white dark:bg-slate-800 border-0 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 font-black text-base dark:text-slate-100" value={formBattery.quantity || 0} onChange={e => setFormBattery({...formBattery, quantity: Number(e.target.value)})} /></div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  <div><label className="block text-[11px] font-black uppercase tracking-[0.25em] text-slate-400 mb-3">{t.labelQuantity}</label><input type="number" className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border-0 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 font-black text-base dark:text-slate-100" value={formBattery.quantity || 0} onChange={e => setFormBattery({...formBattery, quantity: Number(e.target.value), totalQuantity: Number(e.target.value)})} /></div>
                  <div><label className="block text-[11px] font-black uppercase tracking-[0.25em] text-slate-400 mb-3">{t.labelMinQuantity}</label><input type="number" className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border-0 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 font-black text-base dark:text-slate-100" value={formBattery.minQuantity || 0} onChange={e => setFormBattery({...formBattery, minQuantity: Number(e.target.value)})} /></div>
                </div>
              )}
            </div>
            <div className="mt-12 flex gap-4">
              <button onClick={closeModal} className="flex-1 px-4 py-5 rounded-2xl border border-slate-100 dark:border-slate-800 text-slate-400 font-black uppercase tracking-[0.25em] text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">{t.btnCancel}</button>
              <button onClick={saveBattery} className="flex-1 px-4 py-5 rounded-2xl bg-indigo-600 text-white font-black uppercase tracking-[0.25em] text-[11px] hover:bg-indigo-700 transition-all shadow-xl">{t.btnSave}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
