import React from 'react';
import { Palette, RotateCcw, Scissors, SlidersHorizontal, Tag } from 'lucide-react';
import { ExamSettings, Room, Student } from '../types';
import { DEFAULT_SCHOOL_LOGO } from '../utils/defaultLogos';
import {
  CLASS_COLOR_PRESETS,
  buildGradeColorMap,
  getGradeLevelColorTheme,
} from '../utils/classColors';
import { formatRoomNumberLabel } from '../utils/examDocuments';
import { getPaperSizeSpec } from '../utils/exportPdf';

export type DeskCardScope = 'room' | 'all-rooms' | 'class';
export type DeskCardColorStyle = 'full' | 'header';

export interface DeskCardConfig {
  scope: DeskCardScope;
  classFilter: string;
  cardsPerPage: 8 | 10;
  colorStyle: DeskCardColorStyle;
}

interface DeskCardControlBarProps {
  config: DeskCardConfig;
  onChangeConfig: (next: DeskCardConfig) => void;
  orderedClasses: string[];
  orderedGradeLevels: string[];
  settings: ExamSettings;
  onChangeGradeColor: (gradeLevel: string, presetId: string) => void;
  onResetGradeColors: () => void;
  selectedRoom?: Room;
  totalMatchingCards: number;
}

export const DeskCardControlBar: React.FC<DeskCardControlBarProps> = ({
  config,
  onChangeConfig,
  orderedClasses,
  orderedGradeLevels,
  settings,
  onChangeGradeColor,
  onResetGradeColors,
  selectedRoom,
  totalMatchingCards,
}) => {
  const colorMap = buildGradeColorMap(orderedGradeLevels, settings.gradeColors);

  return (
    <div className="print:hidden bg-white border border-slate-200 rounded-lg p-4 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-slate-700 shrink-0" />
          <div>
            <h3 className="text-xs font-bold text-slate-900">
              Pengaturan Kartu Meja Peserta (Warna per Tingkat Kelas)
            </h3>
            <p className="text-2xs text-slate-500">
              Menampilkan{' '}
              <strong className="font-mono tabular-nums text-slate-800">
                {totalMatchingCards} kartu meja
              </strong>{' '}
              ({Math.max(1, Math.ceil(totalMatchingCards / config.cardsPerPage))} halaman{' '}
              {getPaperSizeSpec(settings.paperSize).shortLabel} &middot; {config.cardsPerPage}{' '}
              kartu/hal)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Scope Selector */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md border border-slate-200">
            <button
              type="button"
              onClick={() =>
                onChangeConfig({ ...config, scope: 'room', classFilter: 'ALL' })
              }
              className={`px-2.5 py-1 text-2xs font-bold rounded transition-colors whitespace-nowrap ${
                config.scope === 'room'
                  ? 'theme-nav-active'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {selectedRoom ? selectedRoom.name : 'Ruang Ini'}
            </button>
            <button
              type="button"
              onClick={() => onChangeConfig({ ...config, scope: 'all-rooms' })}
              className={`px-2.5 py-1 text-2xs font-bold rounded transition-colors whitespace-nowrap ${
                config.scope === 'all-rooms'
                  ? 'theme-nav-active'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua Ruang
            </button>
            <button
              type="button"
              onClick={() =>
                onChangeConfig({
                  ...config,
                  scope: 'class',
                  classFilter:
                    config.classFilter === 'ALL'
                      ? orderedClasses[0] || 'ALL'
                      : config.classFilter,
                })
              }
              className={`px-2.5 py-1 text-2xs font-bold rounded transition-colors whitespace-nowrap ${
                config.scope === 'class'
                  ? 'theme-nav-active'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Per Kelas
            </button>
          </div>

          {/* Class Filter */}
          {config.scope !== 'room' && (
            <select
              value={config.classFilter}
              onChange={(e) =>
                onChangeConfig({ ...config, classFilter: e.target.value })
              }
              className="px-2.5 py-1 text-2xs font-semibold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
            >
              <option value="ALL">Semua Kelas ({orderedClasses.length})</option>
              {orderedClasses.map((cls) => (
                <option key={cls} value={cls}>
                  Kelas {cls}
                </option>
              ))}
            </select>
          )}

          {/* Density Selector */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md border border-slate-200">
            <button
              type="button"
              onClick={() => onChangeConfig({ ...config, cardsPerPage: 8 })}
              className={`px-2 py-1 text-2xs font-bold rounded transition-colors whitespace-nowrap ${
                config.cardsPerPage === 8
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              8 / Hal (2&times;4)
            </button>
            <button
              type="button"
              onClick={() => onChangeConfig({ ...config, cardsPerPage: 10 })}
              className={`px-2 py-1 text-2xs font-bold rounded transition-colors whitespace-nowrap ${
                config.cardsPerPage === 10
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              10 / Hal (2&times;5)
            </button>
          </div>

          {/* Color Style Selector */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md border border-slate-200">
            <button
              type="button"
              onClick={() => onChangeConfig({ ...config, colorStyle: 'full' })}
              className={`px-2 py-1 text-2xs font-bold rounded transition-colors whitespace-nowrap ${
                config.colorStyle === 'full'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kartu Berwarna
            </button>
            <button
              type="button"
              onClick={() => onChangeConfig({ ...config, colorStyle: 'header' })}
              className={`px-2 py-1 text-2xs font-bold rounded transition-colors whitespace-nowrap ${
                config.colorStyle === 'header'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Header Berwarna
            </button>
          </div>
        </div>
      </div>

      {/* Per-Grade Color Legend & Customizer */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-2xs font-bold text-slate-700 uppercase tracking-wider">
            <Palette className="w-3.5 h-3.5 text-slate-600" />
            <span>Kode Warna per Tingkat Kelas ({orderedGradeLevels.length} Tingkat)</span>
          </div>

          <button
            type="button"
            onClick={onResetGradeColors}
            className="flex items-center gap-1 px-2 py-1 text-2xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Warna Otomatis</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {orderedGradeLevels.map((grade) => {
            const theme = colorMap[grade] || getGradeLevelColorTheme(grade, settings.gradeColors);
            return (
              <div
                key={grade}
                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border ${theme.cardBgClass} ${theme.borderClass}`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`w-3 h-3 rounded-sm shrink-0 ${theme.swatchClass}`} />
                  <span className={`text-xs font-bold truncate ${theme.accentTextClass}`}>
                    Tingkat {grade}
                  </span>
                </div>
                <select
                  aria-label={`Pilih warna tingkat ${grade}`}
                  value={theme.id}
                  onChange={(e) => onChangeGradeColor(grade, e.target.value)}
                  className="text-2xs font-medium bg-white/90 border border-slate-300 rounded px-1 py-0.5 text-slate-800 focus:outline-none focus:border-slate-900 shrink-0"
                >
                  {CLASS_COLOR_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface DeskCardSheetProps {
  students: Student[];
  rooms: Room[];
  settings: ExamSettings;
  cardsPerPage: 8 | 10;
  colorStyle: DeskCardColorStyle;
  scopeLabel?: string;
}

export const DeskCardSheet: React.FC<DeskCardSheetProps> = ({
  students,
  rooms,
  settings,
  cardsPerPage,
  colorStyle,
  scopeLabel,
}) => {
  const roomMap = new Map<string, Room>();
  rooms.forEach((r) => roomMap.set(r.id, r));

  if (students.length === 0) {
    return (
      <div className="py-16 text-center space-y-2 border border-dashed border-slate-300 rounded-lg bg-slate-50">
        <Tag className="w-8 h-8 text-slate-400 mx-auto" />
        <h3 className="text-sm font-bold text-slate-800">
          Belum Ada Kartu Meja yang Dapat Ditampilkan
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Pastikan siswa sudah dialokasikan ke ruangan ujian dan sesuai dengan filter ruang atau kelas yang dipilih.
        </p>
      </div>
    );
  }

  // Group into A4 pages of 8 or 10 cards
  const pages: Student[][] = [];
  for (let i = 0; i < students.length; i += cardsPerPage) {
    pages.push(students.slice(i, i + cardsPerPage));
  }

  // Show up to 3 pages in live preview with clear note if there are more
  const previewPages = pages.slice(0, 3);
  const hasMorePages = pages.length > previewPages.length;

  return (
    <div className="space-y-6">
      {/* Top Preview Info */}
      <div className="print:hidden bg-slate-100 border border-slate-300 rounded p-2.5 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Scissors className="w-4 h-4 text-slate-700 shrink-0" />
          <span>
            Format Cetak {getPaperSizeSpec(settings.paperSize).shortLabel}:{' '}
            <strong>{cardsPerPage} Kartu Meja / Halaman</strong> (
            {cardsPerPage === 8 ? '2 Kolom × 4 Baris' : '2 Kolom × 5 Baris'}) &middot; Warna otomatis berbeda per tingkat kelas
          </span>
        </div>
        <span className="font-mono text-2xs text-slate-600 tabular-nums">
          Total: <strong>{students.length} Kartu</strong> ({pages.length} Hal){scopeLabel ? ` · ${scopeLabel}` : ''}
        </span>
      </div>

      {previewPages.map((pageCards, pageIdx) => (
        <div key={pageIdx} className="space-y-3">
          {pages.length > 1 && (
            <div className="flex items-center justify-between text-2xs font-mono text-slate-500 border-b border-slate-200 pb-1">
              <span>
                KARTU MEJA PESERTA &middot; {settings.activityName || settings.examTitle}
              </span>
              <span className="tabular-nums">
                Halaman {pageIdx + 1} dari {pages.length}
              </span>
            </div>
          )}

          {/* 2-Column Cuttable Card Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {pageCards.map((st) => {
              const room = st.roomId ? roomMap.get(st.roomId) : undefined;
              const roomNumLabel = room ? formatRoomNumberLabel(room) : st.roomName || '-';
              const roomDisplay = room ? `${room.name} (${room.code})` : st.roomName || '-';
              const theme = getGradeLevelColorTheme(
                st.className,
                settings.gradeColors
              );
              const isCompact = cardsPerPage === 10;

              return (
                <div
                  key={st.id}
                  className={`relative rounded-lg border-2 border-dashed ${theme.borderClass} p-1`}
                >
                  <div
                    className={`rounded-md border ${theme.borderClass} overflow-hidden flex flex-col justify-between ${
                      colorStyle === 'full' ? theme.cardBgClass : 'bg-white'
                    }`}
                  >
                    {/* Top Colored Class Banner */}
                    <div
                      className={`${theme.headerBgClass} ${theme.headerTextClass} px-3 ${
                        isCompact ? 'py-1.5' : 'py-2'
                      } flex items-center justify-between gap-2`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded bg-white/95 p-0.5 flex items-center justify-center shrink-0">
                          <img
                            src={settings.logoRightSchool || DEFAULT_SCHOOL_LOGO}
                            alt="Logo"
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                        <div className="min-w-0 leading-tight">
                          <p className="text-3xs font-bold uppercase tracking-wider opacity-90 truncate">
                            {settings.schoolName}
                          </p>
                          <p className="text-2xs font-extrabold uppercase tracking-wide truncate">
                            KARTU MEJA UJIAN
                          </p>
                        </div>
                      </div>

                      <div className="px-2 py-0.5 rounded bg-white text-slate-950 font-mono text-2xs font-extrabold uppercase shrink-0">
                        {st.className}
                      </div>
                    </div>

                    {/* Main Desk Body */}
                    <div className={`${isCompact ? 'p-2.5' : 'p-3'} flex items-stretch gap-3`}>
                      {/* Big Desk Number Box */}
                      <div
                        className={`${theme.seatBoxBgClass} ${theme.seatBoxTextClass} rounded-md ${
                          isCompact ? 'w-16 py-1.5' : 'w-20 py-2'
                        } px-2 flex flex-col items-center justify-center text-center shrink-0`}
                      >
                        <span className="text-3xs font-bold uppercase tracking-wider opacity-85">
                          NO. MEJA
                        </span>
                        <span
                          className={`${
                            isCompact ? 'text-2xl' : 'text-3xl'
                          } font-mono font-black leading-none my-0.5 tabular-nums`}
                        >
                          {String(st.seatNumber || 1).padStart(2, '0')}
                        </span>
                        <span className="text-3xs font-mono font-bold uppercase opacity-90">
                          R.{roomNumLabel}
                        </span>
                      </div>

                      {/* Participant Identity */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between space-y-1">
                        <div>
                          <span className="text-3xs font-semibold uppercase tracking-wide text-slate-500 block">
                            Nama Peserta
                          </span>
                          <p
                            className={`${
                              isCompact ? 'text-xs' : 'text-sm'
                            } font-extrabold text-slate-950 uppercase leading-snug truncate`}
                            title={st.name}
                          >
                            {st.name}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-2xs">
                          <div>
                            <span className="text-3xs text-slate-500 block">No. Peserta</span>
                            <span className="font-mono font-bold text-slate-900 tabular-nums">
                              {st.participantNo || '-'}
                            </span>
                          </div>
                          <div>
                            <span className="text-3xs text-slate-500 block">NIS</span>
                            <span className="font-mono font-semibold text-slate-800 tabular-nums">
                              {st.nis}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/80">
                          <span className="text-3xs font-semibold text-slate-700 truncate">
                            {roomDisplay}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-3xs font-bold ${theme.badgeBgClass} ${theme.badgeTextClass} shrink-0`}
                          >
                            Kelas {st.className}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Footer Strip */}
                    <div className="px-3 py-1 bg-white/80 border-t border-slate-200/80 flex items-center justify-between text-3xs text-slate-500">
                      <span className="truncate font-medium">
                        {settings.activityName || settings.examTitle}
                      </span>
                      <span className="font-mono shrink-0 ml-2">
                        TA {settings.academicYear}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {hasMorePages && (
        <div className="print:hidden bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-900 text-center">
          Pratinjau menampilkan 3 halaman pertama ({previewPages.length * cardsPerPage} kartu). Klik tombol{' '}
          <strong>Unduh Kartu Meja PDF</strong> untuk mengunduh seluruh{' '}
          <strong>{pages.length} halaman ({students.length} kartu)</strong> secara lengkap.
        </div>
      )}
    </div>
  );
};
