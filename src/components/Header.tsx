import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Settings,
  FileSpreadsheet,
  Building2,
  Users,
  LayoutGrid,
  Sliders,
  Eye,
  Calendar,
  Repeat,
  Palette,
  Check,
} from 'lucide-react';
import { ExamSettings, UiThemeId } from '../types';
import { UI_THEME_OPTIONS, resolveThemeTokens } from '../utils/uiThemes';

export type AppTab =
  | 'dashboard'
  | 'circulation'
  | 'seating'
  | 'students'
  | 'manage-students'
  | 'rooms'
  | 'schedule'
  | 'rules'
  | 'export';

interface HeaderProps {
  settings: ExamSettings;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onChangeTheme: (themeId: UiThemeId) => void;
  isAllocated: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  activeTab,
  setActiveTab,
  onOpenSearch,
  onOpenSettings,
  onChangeTheme,
}) => {
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  const currentThemeId: UiThemeId = settings.uiTheme || 'dynamic-auto';
  const activeTokens = resolveThemeTokens(currentThemeId, activeTab);
  const currentThemeOption =
    UI_THEME_OPTIONS.find((t) => t.id === currentThemeId) || UI_THEME_OPTIONS[0];

  useEffect(() => {
    if (!isThemeMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsThemeMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isThemeMenuOpen]);

  return (
    <header className="print:hidden sticky top-0 z-30 theme-header border-b">
      {/* Subtle top accent stripe following active dynamic theme */}
      <div className="h-[3px] w-full theme-accent-bar" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Bar Row */}
        <div className="flex items-center justify-between gap-4 h-16">
          {/* Zone 1: Brand / title */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-lg theme-brand-mark flex items-center justify-center font-bold text-sm shadow-sm">
              EX
            </div>
            <div>
              <span className="text-base font-bold text-slate-900 tracking-tight block leading-tight">
                SISPRAK RUANG UJIAN
              </span>
              <span className="text-xs text-slate-500 block leading-tight truncate max-w-[180px] sm:max-w-[280px]">
                {settings.activityName || settings.examTitle} &middot; TA {settings.academicYear}
              </span>
            </div>
          </div>

          {/* Zone 2: Navigation Links */}
          <nav className="hidden xl:flex items-center gap-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'dashboard'
                  ? 'theme-nav-active'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Alokasi
            </button>

            <button
              onClick={() => setActiveTab('circulation')}
              className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'circulation'
                  ? 'theme-nav-active'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <Repeat className="w-3.5 h-3.5" />
              Sirkulasi
            </button>

            <button
              onClick={() => setActiveTab('seating')}
              className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'seating'
                  ? 'theme-nav-active'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Denah Ruang
            </button>

            <button
              onClick={() => setActiveTab('students')}
              className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'students'
                  ? 'theme-nav-active'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Daftar Peserta
            </button>

            <button
              onClick={() => setActiveTab('manage-students')}
              className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'manage-students'
                  ? 'theme-nav-active'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              Data Siswa
            </button>

            <button
              onClick={() => setActiveTab('rooms')}
              className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'rooms'
                  ? 'theme-nav-active'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Ruangan
            </button>

            <button
              onClick={() => setActiveTab('schedule')}
              className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'schedule'
                  ? 'theme-nav-active'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Jadwal Ujian
            </button>

            <button
              onClick={() => setActiveTab('rules')}
              className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'rules'
                  ? 'theme-nav-active'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Menu Aturan & Kop
            </button>

            <button
              onClick={() => setActiveTab('export')}
              className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'export'
                  ? 'theme-nav-active'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Ekspor & Cetak
            </button>
          </nav>

          {/* Zone 3: Quick Actions + Live Theme Picker */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onOpenSearch}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white/90 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors whitespace-nowrap"
              title="Cari lokasi ruang & kursi berdasarkan NIS"
            >
              <Search className="w-3.5 h-3.5 theme-accent-icon" />
              <span className="hidden sm:inline">Cek NIS Siswa</span>
            </button>

            {/* Live Dynamic Theme Switcher Popover */}
            <div className="relative" ref={themeMenuRef}>
              <button
                type="button"
                onClick={() => setIsThemeMenuOpen((prev) => !prev)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white/90 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors whitespace-nowrap"
                title={`Tema Warna Aktif: ${currentThemeOption.label}`}
                aria-label="Pilih Tema Warna"
                aria-expanded={isThemeMenuOpen}
              >
                <span
                  className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10"
                  style={{
                    background:
                      currentThemeId === 'dynamic-auto'
                        ? `linear-gradient(135deg, ${activeTokens.primary}, ${activeTokens.secondary})`
                        : activeTokens.primary,
                  }}
                />
                <Palette className="w-3.5 h-3.5 text-slate-500 hidden md:inline" />
                <span className="hidden md:inline">Tema</span>
              </button>

              {isThemeMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-3 z-50 space-y-2.5">
                  <div className="pb-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-900">Tema Warna Antarmuka</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Aktif sekarang:{' '}
                      <span className="font-semibold theme-accent-text">
                        {currentThemeId === 'dynamic-auto'
                          ? `${currentThemeOption.label} (${activeTokens.label})`
                          : currentThemeOption.label}
                      </span>
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    {UI_THEME_OPTIONS.map((option) => {
                      const isSelected = currentThemeId === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            onChangeTheme(option.id);
                            setIsThemeMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg border text-left transition-all ${
                            isSelected
                              ? 'theme-card-active'
                              : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-6 h-6 rounded-md shrink-0 border border-black/10 shadow-2xs"
                              style={{
                                background: option.isDynamic
                                  ? 'linear-gradient(135deg, #2563EB 0%, #0D9488 50%, #D97706 100%)'
                                  : `linear-gradient(135deg, ${option.swatchHex}, ${option.secondaryHex})`,
                              }}
                            />
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-slate-900 block truncate">
                                {option.label}
                              </span>
                              <span className="text-[11px] text-slate-500 block truncate">
                                {option.description}
                              </span>
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 theme-accent-icon shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={onOpenSettings}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 bg-white/90 rounded-md transition-colors"
              title="Pengaturan Data Ujian & Sekolah"
              aria-label="Pengaturan"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Medium and Mobile Navigation bar */}
        <div className="xl:hidden flex items-center gap-1 overflow-x-auto py-2 border-t border-slate-100 scrollbar-none">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
              activeTab === 'dashboard' ? 'theme-nav-active' : 'text-slate-600'
            }`}
          >
            Alokasi
          </button>
          <button
            onClick={() => setActiveTab('circulation')}
            className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
              activeTab === 'circulation' ? 'theme-nav-active' : 'text-slate-600'
            }`}
          >
            Sirkulasi
          </button>
          <button
            onClick={() => setActiveTab('seating')}
            className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
              activeTab === 'seating' ? 'theme-nav-active' : 'text-slate-600'
            }`}
          >
            Denah Meja
          </button>
          <button
            onClick={() => setActiveTab('students')}
            className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
              activeTab === 'students' ? 'theme-nav-active' : 'text-slate-600'
            }`}
          >
            Peserta
          </button>
          <button
            onClick={() => setActiveTab('manage-students')}
            className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
              activeTab === 'manage-students' ? 'theme-nav-active' : 'text-slate-600'
            }`}
          >
            Data Siswa
          </button>
          <button
            onClick={() => setActiveTab('rooms')}
            className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
              activeTab === 'rooms' ? 'theme-nav-active' : 'text-slate-600'
            }`}
          >
            Ruangan
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
              activeTab === 'schedule' ? 'theme-nav-active' : 'text-slate-600'
            }`}
          >
            Jadwal Ujian
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
              activeTab === 'rules' ? 'theme-nav-active' : 'text-slate-600'
            }`}
          >
            Menu Aturan & Kop
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
              activeTab === 'export' ? 'theme-nav-active' : 'text-slate-600'
            }`}
          >
            Ekspor
          </button>
        </div>
      </div>
    </header>
  );
};
