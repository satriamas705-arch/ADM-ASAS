import React, { useState, useRef, useEffect } from 'react';
import {
  Sliders,
  Building,
  Image as ImageIcon,
  Upload,
  RotateCcw,
  Eye,
  Printer,
  Download,
  CheckCircle2,
  AlertCircle,
  DoorOpen,
  LayoutGrid,
  FileText,
  Armchair,
  Save,
  Building2,
  Users,
  Info,
  CreditCard,
  Calendar,
  Plus,
  Trash2,
  Calculator,
  ShieldAlert,
  Layers,
  ArrowRight,
  GraduationCap,
  Shuffle,
  ListOrdered,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ClipboardList,
  ArrowLeftRight,
  Tag,
  Grid,
  UserCheck,
} from 'lucide-react';
import {
  Student,
  Room,
  ExamSettings,
  ExamScheduleItem,
  DailyRoomJournalRecord,
  HandoverBeritaAcaraRecord,
  HandoverDirectionMode,
  DailyRoomInvigilatorAssignment,
  PaperSize,
} from '../types';
import { DEFAULT_PEMDA_LOGO, DEFAULT_SCHOOL_LOGO } from '../utils/defaultLogos';
import { getClassColorTheme } from '../utils/classColors';
import {
  PAPER_SIZE_OPTIONS,
  getPaperSizeSpec,
  exportAttendancePdfForTarget,
  exportBundledAttendancePdfForTargets,
  exportAllSubjectsAttendancePdfForTargets,
  exportAttendance2PdfForTarget,
  exportBundledAttendance2PdfForTargets,
  exportDoorPosterPdf,
  exportExamCardsPdf,
  exportSingleStudentCardPdf,
  exportDeskCardsPdf,
  exportDailyJournalPdf,
  exportAllDailyJournalsPdf,
  exportHandoverBeritaAcaraPdf,
  exportAllHandoverBeritaAcaraPdf,
  exportDistributionMatrixPdf,
  exportInvigilatorSchedulePdf,
  exportInvigilatorAttendancePdf,
} from '../utils/exportPdf';
import { exportAllocationToExcel } from '../utils/exportExcel';
import {
  AttendanceGroupingMode,
  AttendanceTarget,
  buildExamDayGroups,
  makeRoomDayKey,
  loadJournalRecords,
  saveJournalRecords,
  loadHandoverRecords,
  saveHandoverRecords,
  resolveJournalRecord,
  resolveHandoverRecord,
  extractCityFromAddress,
  extractCityFromSettings,
  extractSignatureDateFromSettings,
  getOrderedClassNames,
  getOrderedClassNamesInRoom,
  getRoomClassPairs,
  getStudentsForAttendanceTarget,
  getRoomDaySessionInvigilator,
  getRoomDaySessionInvigilatorNip,
  getSessionDisplayLabel,
  syncStoredDocumentsWithDailyInvigilators,
  syncStoredDocumentsWithSettings,
  getSchedulesForStudentCard,
} from '../utils/examDocuments';
import {
  JournalControlBar,
  HandoverControlBar,
  ExamJournalSheet,
  ExamHandoverSheet,
} from './ExamJournalAndHandoverPreview';
import {
  AttendanceControlBar,
  AttendanceSheetConfig,
  ExamAttendanceSheet,
  ExamAttendance2Sheet,
} from './ExamAttendanceSheet';
import { DailyInvigilatorMatrix } from './DailyInvigilatorMatrix';
import {
  DeskCardConfig,
  DeskCardControlBar,
  DeskCardSheet,
} from './DeskCardPreview';
import {
  DistributionMatrixSheet,
  InvigilatorControlBar,
  InvigilatorScheduleAndAttendanceSheet,
  InvigilatorSubMode,
} from './DistributionAndInvigilatorPreview';
import { OfficialSignatureGraphic } from './OfficialSignatureGraphic';
import { processStampFileToTransparentPng } from '../utils/imageTransparency';

interface RulesAndPreviewMenuProps {
  settings: ExamSettings;
  rooms: Room[];
  students: Student[];
  schedules?: ExamScheduleItem[];
  onUpdateSettings: (newSettings: ExamSettings) => void;
  onUpdateSettingsOnly?: (newSettings: ExamSettings) => void;
  onUpdateRooms: (newRooms: Room[]) => void;
  onUpdateRoomsMeta?: (newRooms: Room[], message?: string) => void;
}

export const RulesAndPreviewMenu: React.FC<RulesAndPreviewMenuProps> = ({
  settings,
  rooms,
  students,
  schedules = [],
  onUpdateSettings,
  onUpdateSettingsOnly,
  onUpdateRooms,
  onUpdateRoomsMeta,
}) => {
  // Sub-tabs in Menu Aturan
  const [subTab, setSubTab] = useState<'rules-chairs' | 'rules-kop' | 'preview'>('preview');

  // Preview sub-options
  const [previewDocType, setPreviewDocType] = useState<
    | 'door'
    | 'seating'
    | 'attendance'
    | 'attendance2'
    | 'card'
    | 'desk-card'
    | 'journal'
    | 'handover'
    | 'distribution-matrix'
    | 'invigilators'
  >('door');
  const [invigilatorSubMode, setInvigilatorSubMode] =
    useState<InvigilatorSubMode>('attendance-multi');
  const [attendanceGroupingMode, setAttendanceGroupingMode] =
    useState<AttendanceGroupingMode>('per-room-class');
  const [selectedPreviewRoomId, setSelectedPreviewRoomId] = useState<string>(rooms[0]?.id || '');
  const [selectedPreviewStudentId, setSelectedPreviewStudentId] = useState<string>(students[0]?.id || '');
  const [previewZoom, setPreviewZoom] = useState<'fit' | '100%'>('fit');

  // Exam days derived from schedules for Jurnal Harian & BA Serah Terima
  const examDayGroups = React.useMemo(() => buildExamDayGroups(schedules), [schedules]);
  const [selectedDayKey, setSelectedDayKey] = useState<string>(examDayGroups[0]?.dayKey || '');

  useEffect(() => {
    if (!examDayGroups.some((dg) => dg.dayKey === selectedDayKey) && examDayGroups.length > 0) {
      setSelectedDayKey(examDayGroups[0].dayKey);
    }
  }, [examDayGroups, selectedDayKey]);

  const selectedDayGroup =
    examDayGroups.find((dg) => dg.dayKey === selectedDayKey) || examDayGroups[0];
  const [selectedSeatingScheduleId, setSelectedSeatingScheduleId] = useState<string>(
    selectedDayGroup?.sessions[0]?.id || ''
  );

  useEffect(() => {
    const sessions = selectedDayGroup?.sessions || [];
    if (sessions.length > 0 && !sessions.some((s) => s.id === selectedSeatingScheduleId)) {
      setSelectedSeatingScheduleId(sessions[0].id);
    } else if (sessions.length === 0 && selectedSeatingScheduleId !== '') {
      setSelectedSeatingScheduleId('');
    }
  }, [selectedDayGroup, selectedSeatingScheduleId]);

  // Persistent Jurnal Harian & BA Serah Terima state
  const [journalMap, setJournalMap] = useState<Record<string, DailyRoomJournalRecord>>(() =>
    loadJournalRecords()
  );
  const [handoverMap, setHandoverMap] = useState<Record<string, HandoverBeritaAcaraRecord>>(() =>
    loadHandoverRecords()
  );

  const [journalBlankMode, setJournalBlankMode] = useState<boolean>(false);
  const [isEditingJournal, setIsEditingJournal] = useState<boolean>(false);

  const [handoverBlankMode, setHandoverBlankMode] = useState<boolean>(false);
  const [isEditingHandover, setIsEditingHandover] = useState<boolean>(false);
  const [handoverDirectionMode, setHandoverDirectionMode] = useState<HandoverDirectionMode>('both');

  // Attendance Sheet Config & Editor state (matching uploaded Daftar Hadir format)
  const [isEditingAttendance, setIsEditingAttendance] = useState<boolean>(false);
  const [attendanceConfig, setAttendanceConfig] = useState<AttendanceSheetConfig>(() => {
    const firstSch = schedules[0];
    return {
      scheduleId: firstSch?.id || 'custom',
      dayDateText: firstSch ? `${firstSch.day}, ${firstSch.date}` : settings.examDate || '',
      subjectText: firstSch?.subject || 'Ilmu Pengetahuan Alam',
      cityLabel: extractCityFromSettings(settings),
      dateLine: extractSignatureDateFromSettings(settings, '_____________________'),
      invigilatorName: '',
      invigilatorNip: '',
      subjectTeacherName: '',
    };
  });

  const handleResetAttendanceConfig = () => {
    const firstSch = schedules[0];
    setAttendanceConfig({
      scheduleId: firstSch?.id || 'custom',
      dayDateText: firstSch ? `${firstSch.day}, ${firstSch.date}` : settings.examDate || '',
      subjectText: firstSch?.subject || 'Ilmu Pengetahuan Alam',
      cityLabel: extractCityFromSettings(settings),
      dateLine: extractSignatureDateFromSettings(settings, '_____________________'),
      invigilatorName: '',
      invigilatorNip: '',
      subjectTeacherName: '',
    });
    showFeedback('Pengaturan Daftar Hadir dikembalikan ke standar.');
  };

  // Form states for Kop & Rules
  const [formData, setFormData] = useState<ExamSettings>({ ...settings });
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const prevSettingsRef = useRef<ExamSettings>(settings);

  useEffect(() => {
    const prev = prevSettingsRef.current;
    if (prev === settings) return;

    setFormData({ ...settings });

    const prevCity = extractCityFromSettings(prev);
    const nextCity = extractCityFromSettings(settings);
    const prevDate = extractSignatureDateFromSettings(prev, '_____________________');
    const nextDate = extractSignatureDateFromSettings(settings, '_____________________');

    if (prevCity !== nextCity || prevDate !== nextDate) {
      setAttendanceConfig((curr) => ({
        ...curr,
        cityLabel:
          !curr.cityLabel || curr.cityLabel === prevCity ? nextCity : curr.cityLabel,
        dateLine:
          !curr.dateLine ||
          curr.dateLine === prevDate ||
          curr.dateLine === '_____________________'
            ? nextDate
            : curr.dateLine,
      }));
      setJournalMap(loadJournalRecords());
      setHandoverMap(loadHandoverRecords());
    }

    prevSettingsRef.current = settings;
  }, [settings]);

  // File upload refs
  const fileInputPemdaRef = useRef<HTMLInputElement>(null);
  const fileInputSchoolRef = useRef<HTMLInputElement>(null);
  const fileInputHeadmasterSigRef = useRef<HTMLInputElement>(null);
  const fileInputCommitteeSigRef = useRef<HTMLInputElement>(null);
  const fileInputStampRef = useRef<HTMLInputElement>(null);

  const selectedRoom = rooms.find((r) => r.id === selectedPreviewRoomId) || rooms[0];
  const roomStudents = selectedRoom
    ? students
        .filter((s) => s.roomId === selectedRoom.id)
        .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0))
    : [];

  const selectedStudent =
    students.find((s) => s.id === selectedPreviewStudentId) ||
    roomStudents[0] ||
    students[0];

  const showFeedback = (msg: string) => {
    setSavedFeedback(msg);
    setTimeout(() => setSavedFeedback(null), 3500);
  };

  const activePaperSpec = getPaperSizeSpec(settings.paperSize);
  const handleChangePaperSize = (paperSize: PaperSize) => {
    const nextSettings: ExamSettings = {
      ...settings,
      paperSize,
    };
    setFormData((prev) => ({ ...prev, paperSize }));
    if (onUpdateSettingsOnly) {
      onUpdateSettingsOnly(nextSettings);
    } else {
      onUpdateSettings(nextSettings);
    }
    showFeedback(`Ukuran kertas cetak diubah ke ${getPaperSizeSpec(paperSize).label}.`);
  };

  // Desk Card preview config & class color handlers
  const [deskCardConfig, setDeskCardConfig] = useState<DeskCardConfig>({
    scope: 'room',
    classFilter: 'ALL',
    cardsPerPage: 8,
    colorStyle: 'full',
  });

  const handleChangeClassColor = (className: string, presetId: string) => {
    const nextClassColors = {
      ...(settings.classColors || {}),
      [className]: presetId,
    };
    const nextSettings: ExamSettings = {
      ...settings,
      classColors: nextClassColors,
    };
    setFormData((prev) => ({ ...prev, classColors: nextClassColors }));
    if (onUpdateSettingsOnly) {
      onUpdateSettingsOnly(nextSettings);
    } else {
      onUpdateSettings(nextSettings);
    }
  };

  const handleResetClassColors = () => {
    const nextSettings: ExamSettings = {
      ...settings,
      classColors: undefined,
    };
    setFormData((prev) => ({ ...prev, classColors: undefined }));
    if (onUpdateSettingsOnly) {
      onUpdateSettingsOnly(nextSettings);
    } else {
      onUpdateSettings(nextSettings);
    }
    showFeedback('Warna kartu meja tiap kelas dikembalikan ke palet otomatis.');
  };

  // Attendance grouping (Per Ruang / Per Kelas / Per Ruang & Kelas)
  const orderedClasses = React.useMemo(
    () => getOrderedClassNames(students, settings.customClassOrder),
    [students, settings.customClassOrder]
  );

  const classesInSelectedRoom = React.useMemo(() => {
    if (!selectedRoom) return orderedClasses;
    const inRoom = getOrderedClassNamesInRoom(
      students,
      selectedRoom.id,
      settings.customClassOrder
    );
    return inRoom.length > 0 ? inRoom : orderedClasses;
  }, [students, selectedRoom, orderedClasses, settings.customClassOrder]);

  const [selectedAttendanceClass, setSelectedAttendanceClass] = useState<string>(
    orderedClasses[0] || ''
  );

  useEffect(() => {
    const validList =
      attendanceGroupingMode === 'per-room-class' ? classesInSelectedRoom : orderedClasses;
    if (validList.length > 0 && !validList.includes(selectedAttendanceClass)) {
      setSelectedAttendanceClass(validList[0]);
    } else if (validList.length === 0 && selectedAttendanceClass !== '') {
      setSelectedAttendanceClass('');
    }
  }, [attendanceGroupingMode, classesInSelectedRoom, orderedClasses, selectedAttendanceClass]);

  const activeAttendanceTarget: AttendanceTarget | null = React.useMemo(() => {
    if (attendanceGroupingMode === 'per-class') {
      return selectedAttendanceClass
        ? { mode: 'per-class', className: selectedAttendanceClass }
        : null;
    }
    if (!selectedRoom) return null;
    if (attendanceGroupingMode === 'per-room-class') {
      return {
        mode: 'per-room-class',
        room: selectedRoom,
        className: selectedAttendanceClass || classesInSelectedRoom[0] || '-',
      };
    }
    return { mode: 'per-room', room: selectedRoom };
  }, [attendanceGroupingMode, selectedRoom, selectedAttendanceClass, classesInSelectedRoom]);

  const attendanceTargetStudents = React.useMemo(() => {
    if (!activeAttendanceTarget) return [];
    return getStudentsForAttendanceTarget(students, activeAttendanceTarget);
  }, [students, activeAttendanceTarget]);

  const allBundleTargetsForMode: AttendanceTarget[] = React.useMemo(() => {
    if (attendanceGroupingMode === 'per-class') {
      return orderedClasses.map((className) => ({ mode: 'per-class', className }));
    }
    if (attendanceGroupingMode === 'per-room-class') {
      const pairs = getRoomClassPairs(rooms, students, settings.customClassOrder);
      if (pairs.length > 0) {
        return pairs.map(({ room, className }) => ({
          mode: 'per-room-class',
          room,
          className,
        }));
      }
      return rooms.map((room) => ({
        mode: 'per-room-class',
        room,
        className: orderedClasses[0] || '-',
      }));
    }
    return rooms.map((room) => ({ mode: 'per-room', room }));
  }, [attendanceGroupingMode, rooms, students, orderedClasses, settings.customClassOrder]);

  const deskCardStudents = React.useMemo(() => {
    const roomOrder = new Map<string, number>();
    rooms.forEach((r, idx) => roomOrder.set(r.id, idx));

    return students
      .filter((s) => Boolean(s.roomId))
      .filter((s) => {
        if (deskCardConfig.scope === 'room' && selectedRoom) {
          return s.roomId === selectedRoom.id;
        }
        return true;
      })
      .filter((s) => {
        if (deskCardConfig.scope !== 'room' && deskCardConfig.classFilter !== 'ALL') {
          return (s.className?.trim() || 'Tanpa Kelas') === deskCardConfig.classFilter;
        }
        return true;
      })
      .sort((a, b) => {
        const rA = roomOrder.get(a.roomId || '') ?? 9999;
        const rB = roomOrder.get(b.roomId || '') ?? 9999;
        if (rA !== rB) return rA - rB;
        return (a.seatNumber || 0) - (b.seatNumber || 0);
      });
  }, [students, rooms, deskCardConfig, selectedRoom]);

  // Active Journal & Handover records
  const activeJournalRecord = React.useMemo(() => {
    if (!selectedRoom) return null;
    return resolveJournalRecord(journalMap, selectedRoom, examDayGroups, settings);
  }, [journalMap, selectedRoom, examDayGroups, settings]);

  const activeHandoverRecord = React.useMemo(() => {
    if (!selectedRoom || !selectedDayGroup) return null;
    return resolveHandoverRecord(handoverMap, selectedRoom, selectedDayGroup, roomStudents, settings);
  }, [handoverMap, selectedRoom, selectedDayGroup, roomStudents, settings]);

  const handleUpdateJournalRecord = (updated: DailyRoomJournalRecord) => {
    const next = { ...journalMap, [updated.roomId]: updated };
    setJournalMap(next);
    saveJournalRecords(next);
  };

  const handleResetJournalRecord = () => {
    if (!selectedRoom) return;
    const next = { ...journalMap };
    delete next[selectedRoom.id];
    setJournalMap(next);
    saveJournalRecords(next);
    showFeedback(`Jurnal ${selectedRoom.name} dikembalikan ke standar.`);
  };

  const handleApplyCityToAllRooms = () => {
    if (!activeJournalRecord) return;
    const next = { ...journalMap };
    for (const r of rooms) {
      const existing = resolveJournalRecord(next, r, examDayGroups, settings);
      next[r.id] = {
        ...existing,
        signatureCity: activeJournalRecord.signatureCity,
        signatureDateText: activeJournalRecord.signatureDateText,
      };
    }
    setJournalMap(next);
    saveJournalRecords(next);
    showFeedback(
      `Kota & tanggal tanda tangan berhasil diterapkan ke seluruh ${rooms.length} ruang.`
    );
  };

  const handleSaveDailyInvigilators = (
    dailyMap: Record<string, DailyRoomInvigilatorAssignment>,
    sessionMap: Record<string, string>,
    updatedRooms: Room[],
    message: string,
    sessionNipMap?: Record<string, string>
  ) => {
    const nextSessionNips = sessionNipMap ?? settings.sessionInvigilatorNips;
    const nextSettings: ExamSettings = {
      ...settings,
      dailyInvigilators: dailyMap,
      sessionInvigilators: sessionMap,
      sessionInvigilatorNips: nextSessionNips,
    };
    setFormData((prev) => ({
      ...prev,
      dailyInvigilators: dailyMap,
      sessionInvigilators: sessionMap,
      sessionInvigilatorNips: nextSessionNips,
    }));

    if (onUpdateSettingsOnly) {
      onUpdateSettingsOnly(nextSettings);
    } else {
      onUpdateSettings(nextSettings);
    }

    const synced = syncStoredDocumentsWithDailyInvigilators(
      dailyMap,
      updatedRooms,
      examDayGroups,
      sessionMap
    );
    setJournalMap(synced.journalMap);
    setHandoverMap(synced.handoverMap);

    if (onUpdateRoomsMeta) {
      onUpdateRoomsMeta(updatedRooms);
    } else {
      onUpdateRooms(updatedRooms);
    }
    showFeedback(message);
  };

  const handleUpdateHandoverRecord = (updated: HandoverBeritaAcaraRecord) => {
    const key = makeRoomDayKey(updated.roomId, updated.dayKey);
    const next = { ...handoverMap, [key]: updated };
    setHandoverMap(next);
    saveHandoverRecords(next);
  };

  const handleResetHandoverRecord = () => {
    if (!selectedRoom || !selectedDayGroup) return;
    const key = makeRoomDayKey(selectedRoom.id, selectedDayGroup.dayKey);
    const next = { ...handoverMap };
    delete next[key];
    setHandoverMap(next);
    saveHandoverRecords(next);
    showFeedback(
      `Berita Acara Serah Terima ${selectedRoom.name} (${selectedDayGroup.label}) dikembalikan ke standar.`
    );
  };

  const handleApplyHandoverOfficerToAllRooms = () => {
    if (!activeHandoverRecord) return;
    const next = { ...handoverMap };
    for (const r of rooms) {
      const rStudents = students.filter((s) => s.roomId === r.id);
      const totalCopies = String(rStudents.length + (activeHandoverRecord.reserveCopies || 0));
      for (const dg of examDayGroups) {
        const existing = resolveHandoverRecord(next, r, dg, rStudents, settings);
        const updatedSessions = { ...existing.sessions };
        for (const sch of dg.sessions) {
          updatedSessions[sch.id] = {
            ...(updatedSessions[sch.id] || {
              scheduleId: sch.id,
              questionCopies: totalCopies,
              answerSheetCopies: totalCopies,
              returnedFilledSheets: '',
              returnedUnusedSheets: '',
              returnedQuestionCopies: '',
              notes: '',
            }),
            questionCopies: totalCopies,
            answerSheetCopies: totalCopies,
          };
        }
        const key = makeRoomDayKey(r.id, dg.dayKey);
        next[key] = {
          ...existing,
          committeeOfficerOut: activeHandoverRecord.committeeOfficerOut,
          committeeOfficerIn: activeHandoverRecord.committeeOfficerIn,
          handoverOutTime: activeHandoverRecord.handoverOutTime,
          handoverInTime: activeHandoverRecord.handoverInTime,
          reserveCopies: activeHandoverRecord.reserveCopies,
          sealStatusOut: activeHandoverRecord.sealStatusOut,
          sealStatusIn: activeHandoverRecord.sealStatusIn,
          notesOut: activeHandoverRecord.notesOut,
          notesIn: activeHandoverRecord.notesIn,
          sessions: updatedSessions,
        };
      }
    }
    setHandoverMap(next);
    saveHandoverRecords(next);
    showFeedback(
      `Petugas panitia, jam serah terima, dan jumlah cadangan (${activeHandoverRecord.reserveCopies} eks) diterapkan ke seluruh ${rooms.length} ruang × ${examDayGroups.length} hari.`
    );
  };

  // Target room count input state
  const [targetRoomsInput, setTargetRoomsInput] = useState<number>(rooms.length || 4);

  useEffect(() => {
    setTargetRoomsInput(rooms.length);
  }, [rooms.length]);

  useEffect(() => {
    setFormData({ ...settings });
  }, [settings]);

  // Calculations for room count rules & POS recommendations
  const totalCapacity = rooms.reduce((acc, r) => acc + r.capacity, 0);
  const idealCapacity = formData.defaultRoomCapacity || 24;
  const recommendedRoomsCount = Math.max(1, Math.ceil((students.length || 1) / idealCapacity));
  const capacityDiff = totalCapacity - students.length;
  const isDeficit = capacityDiff < 0;
  const maxRooms = formData.maxRoomsAllowed || 12;
  const invigilatorsPerRoom = 1;
  const totalInvigilatorsNeeded = rooms.length * invigilatorsPerRoom;

  // Class statistics for room distribution by class order
  const classStats = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of students) {
      const cls = s.className?.trim() || 'Tanpa Kelas';
      map[cls] = (map[cls] || 0) + 1;
    }
    return map;
  }, [students]);

  const detectedClasses = React.useMemo(() => {
    return Object.keys(classStats).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [classStats]);

  const currentClassOrder = React.useMemo(() => {
    if (formData.customClassOrder && formData.customClassOrder.length > 0) {
      const set = new Set(formData.customClassOrder);
      const ordered = formData.customClassOrder.filter((c) => classStats[c]);
      for (const c of detectedClasses) {
        if (!set.has(c)) ordered.push(c);
      }
      return ordered;
    }
    return detectedClasses;
  }, [formData.customClassOrder, detectedClasses, classStats]);

  const handleMoveClass = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentClassOrder.length) return;
    const newOrder = [...currentClassOrder];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);
    setFormData((prev) => ({ ...prev, customClassOrder: newOrder }));
  };

  const handleSortClassesAsc = () => {
    const sorted = [...detectedClasses].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );
    setFormData((prev) => ({ ...prev, customClassOrder: sorted }));
  };

  const handleSortClassesDesc = () => {
    const sorted = [...detectedClasses].sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' })
    );
    setFormData((prev) => ({ ...prev, customClassOrder: sorted }));
  };

  const handleResetClassOrder = () => {
    setFormData((prev) => ({ ...prev, customClassOrder: undefined }));
  };

  // Handler to adjust the number of rooms to a specific count
  const handleApplyRoomCount = (targetCount: number) => {
    const validCount = Math.min(Math.max(1, targetCount), 30);
    let newRooms: Room[] = [...rooms];

    if (newRooms.length < validCount) {
      const toAdd = validCount - newRooms.length;
      for (let i = 0; i < toAdd; i++) {
        const nextNum = newRooms.length + 1;
        const codeNum = String(nextNum).padStart(2, '0');
        newRooms.push({
          id: `room-gen-${Date.now()}-${nextNum}`,
          name: `Ruang ${codeNum}`,
          code: `R${codeNum}`,
          capacity: formData.defaultRoomCapacity || 24,
          columns: formData.defaultRoomColumns || 4,
          building: rooms[0]?.building || 'Gedung A - Lantai 1',
          invigilator1: `Pengawas Ruang ${codeNum}`,
        });
      }
    } else if (newRooms.length > validCount) {
      newRooms = newRooms.slice(0, validCount);
    }

    onUpdateRooms(newRooms);
    const updatedSettings: ExamSettings = {
      ...formData,
      targetRoomCount: validCount,
    };
    setFormData(updatedSettings);
    onUpdateSettings(updatedSettings);
    setTargetRoomsInput(validCount);
    showFeedback(`Aturan banyaknya ruang diterapkan! Jumlah ruang ujian kini menjadi ${validCount} ruangan.`);
  };

  const handleApplyRecommendedRooms = () => {
    handleApplyRoomCount(recommendedRoomsCount);
  };

  const handleAddSingleRoomQuick = () => {
    handleApplyRoomCount(rooms.length + 1);
  };

  const handleRemoveLastRoomQuick = () => {
    if (rooms.length <= 1) {
      showFeedback('Minimal harus ada 1 ruangan ujian!');
      return;
    }
    handleApplyRoomCount(rooms.length - 1);
  };

  const handleSaveSettings = (e?: React.FormEvent, skipReallocate = false) => {
    if (e) e.preventDefault();
    const syncedDocs = syncStoredDocumentsWithSettings(settings, formData);
    setJournalMap(syncedDocs.journalMap);
    setHandoverMap(syncedDocs.handoverMap);

    const prevCity = extractCityFromSettings(settings);
    const nextCity = extractCityFromSettings(formData);
    const prevDate = extractSignatureDateFromSettings(settings, '_____________________');
    const nextDate = extractSignatureDateFromSettings(formData, '_____________________');

    setAttendanceConfig((curr) => ({
      ...curr,
      cityLabel:
        !curr.cityLabel || curr.cityLabel === prevCity || prevCity !== nextCity
          ? nextCity
          : curr.cityLabel,
      dateLine:
        !curr.dateLine ||
        curr.dateLine === prevDate ||
        curr.dateLine === '_____________________' ||
        prevDate !== nextDate
          ? nextDate
          : curr.dateLine,
    }));

    if (skipReallocate && onUpdateSettingsOnly) {
      onUpdateSettingsOnly(formData);
    } else {
      onUpdateSettings(formData);
    }
    showFeedback(
      'Pengaturan kop, pejabat penandatangan, tempat & tanggal berhasil disimpan dan disinkronkan ke seluruh dokumen!'
    );
  };

  // Chair rules: Apply uniform capacity to all rooms
  const handleApplyUniformCapacity = () => {
    const updatedRooms = rooms.map((r) => ({
      ...r,
      capacity: formData.defaultRoomCapacity,
      columns: formData.defaultRoomColumns,
    }));
    onUpdateRooms(updatedRooms);
    onUpdateSettings({
      ...formData,
      uniformCapacityMode: true,
    });
    showFeedback(
      `Aturan berhasil diterapkan! Seluruh ${rooms.length} ruangan kini berkapasitas ${formData.defaultRoomCapacity} kursi (${formData.defaultRoomColumns} kolom).`
    );
  };

  // Image Upload Handlers
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'pemda' | 'school') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showFeedback('Ukuran file logo maksimal 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        if (target === 'pemda') {
          setFormData((prev) => ({ ...prev, logoLeftPemda: result }));
          onUpdateSettings({ ...settings, logoLeftPemda: result });
          showFeedback('Logo Kiri (Pemda) berhasil diunggah!');
        } else {
          setFormData((prev) => ({ ...prev, logoRightSchool: result }));
          onUpdateSettings({ ...settings, logoRightSchool: result });
          showFeedback('Logo Kanan (Sekolah) berhasil diunggah!');
        }
      }
    };
    reader.readAsDataURL(file);
  };

  type SignatureAssetField = 'headmasterSignature' | 'committeeSignature' | 'schoolStamp';

  const handleSignatureAssetUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: SignatureAssetField,
    label: string
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showFeedback(`Ukuran file ${label} maksimal 2MB.`);
      return;
    }

    const applyAssetDataUrl = (result: string, extraNote = '') => {
      const nextFormData: ExamSettings = { ...formData, [field]: result };
      const nextSettings: ExamSettings = { ...settings, [field]: result };
      setFormData(nextFormData);
      if (onUpdateSettingsOnly) {
        onUpdateSettingsOnly(nextSettings);
      } else {
        onUpdateSettings(nextSettings);
      }
      showFeedback(`${label} berhasil diunggah${extraNote} & disinkronkan ke seluruh dokumen!`);
    };

    if (field === 'schoolStamp') {
      try {
        const transparentPng = await processStampFileToTransparentPng(file);
        applyAssetDataUrl(transparentPng, ' (background otomatis transparan)');
        return;
      } catch {
        // Fall back to direct FileReader if image canvas processing fails
      }
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        applyAssetDataUrl(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClearSignatureAsset = (field: SignatureAssetField, label: string) => {
    const nextFormData: ExamSettings = { ...formData, [field]: undefined };
    const nextSettings: ExamSettings = { ...settings, [field]: undefined };
    setFormData(nextFormData);
    if (onUpdateSettingsOnly) {
      onUpdateSettingsOnly(nextSettings);
    } else {
      onUpdateSettings(nextSettings);
    }
    showFeedback(`${label} dihapus.`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Menu Aturan & Pratinjau Dokumen
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Konfigurasi aturan kapasitas kursi, identitas kop surat (dua logo), dan pratinjau langsung dokumen resmi
          </p>
        </div>

        {/* Sub-tab navigation */}
        <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setSubTab('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              subTab === 'preview'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Tampilan / Preview Dokumen</span>
          </button>

          <button
            onClick={() => setSubTab('rules-chairs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              subTab === 'rules-chairs'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-slate-700" />
            <span>Aturan Banyaknya Ruang & Kursi</span>
            <span className="ml-0.5 px-1.5 py-0.5 bg-slate-100 text-slate-700 text-2xs font-mono font-bold rounded">
              {rooms.length} Ruang
            </span>
          </button>

          <button
            onClick={() => setSubTab('rules-kop')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              subTab === 'rules-kop'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Kop, Logo & Pengesahan</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {savedFeedback && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg p-3 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{savedFeedback}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. ATURAN BANYAKNYA RUANG & STANDAR KURSI UJIAN          */}
      {/* ======================================================== */}
      {subTab === 'rules-chairs' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-700" />
                  <span>Aturan Banyaknya Ruang & Standar Kursi Ujian</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Konfigurasi jumlah ruang ujian, estimasi matematis POS, batas fisik sekolah, mode distribusi siswa, dan kebutuhan pengawas
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveSettings()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-2xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Aturan</span>
                </button>
              </div>
            </div>

            {/* 1. Kalkulator & Analisis Kebutuhan Banyaknya Ruang (Live Estimator) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5 text-slate-600" />
                  Analisis Kebutuhan Banyaknya Ruang (Standar POS)
                </span>
                <span className="text-2xs font-mono text-slate-500">
                  Total Siswa: {students.length} orang | Standar: {formData.defaultRoomCapacity} kursi/ruang
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Metrik 1: Jumlah Ruang Aktif */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                  <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wide block">
                    Banyaknya Ruang Aktif
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold font-mono text-slate-900">{rooms.length}</span>
                    <span className="text-xs text-slate-600">ruang</span>
                  </div>
                  <span className="text-2xs text-slate-500 block truncate">
                    Batas Fisik: maks. {maxRooms} ruang
                  </span>
                </div>

                {/* Metrik 2: Total Kapasitas Kursi */}
                <div className={`border rounded-lg p-3 space-y-1 ${
                  isDeficit ? 'bg-rose-50/70 border-rose-200' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wide block">
                    Daya Tampung Total
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-xl font-bold font-mono ${isDeficit ? 'text-rose-700' : 'text-slate-900'}`}>
                      {totalCapacity}
                    </span>
                    <span className="text-xs text-slate-600">kursi</span>
                  </div>
                  <span className={`text-2xs font-semibold block ${isDeficit ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {isDeficit ? `Defisit ${Math.abs(capacityDiff)} kursi` : `Surplus +${capacityDiff} kursi`}
                  </span>
                </div>

                {/* Metrik 3: Rekomendasi Kebutuhan Ruang POS */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                  <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wide block">
                    Rekomendasi POS
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold font-mono text-slate-900">{recommendedRoomsCount}</span>
                    <span className="text-xs text-slate-600">ruangan</span>
                  </div>
                  <span className="text-2xs text-slate-500 block truncate">
                    Formula: ceil({students.length} / {idealCapacity})
                  </span>
                </div>

                {/* Metrik 4: Kebutuhan Pengawas */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                  <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wide block">
                    Kebutuhan Pengawas
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold font-mono text-slate-900">{totalInvigilatorsNeeded}</span>
                    <span className="text-xs text-slate-600">orang</span>
                  </div>
                  <span className="text-2xs text-slate-500 block truncate">
                    Rasio: {invigilatorsPerRoom} pengawas / ruang
                  </span>
                </div>
              </div>

              {/* Status Alert Banner */}
              {isDeficit ? (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-900">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Kapasitas Ruang Kurang!</span>
                      <p className="text-2xs text-rose-700 mt-0.5 leading-relaxed">
                        Kapasitas total ({totalCapacity} kursi) tidak mencukupi untuk <strong>{students.length} siswa</strong> terdaftar. Terjadi defisit <strong>{Math.abs(capacityDiff)} kursi</strong>. Minimal dibutuhkan <strong>{recommendedRoomsCount} ruangan</strong> ujian.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyRecommendedRooms}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-md whitespace-nowrap shadow-xs transition-colors shrink-0"
                  >
                    Sesuaikan ke {recommendedRoomsCount} Ruang
                  </button>
                </div>
              ) : rooms.length > maxRooms ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Peringatan Ketersediaan Ruangan:</span>
                    <p className="text-2xs text-amber-800 mt-0.5 leading-relaxed">
                      Jumlah ruangan aktif ({rooms.length} ruang) melebihi batas ketersediaan ruang fisik sekolah ({maxRooms} ruang). Pastikan ruang kelas fisik dan pengawas tersedia.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 flex items-center justify-between gap-2 text-xs text-emerald-900">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>Status Kapasitas Ideal:</strong> Seluruh {students.length} siswa tertampung sempurna di {rooms.length} ruangan dengan cadangan {capacityDiff} kursi kosong.
                    </span>
                  </div>
                  <span className="text-2xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                    Mencukupi 100%
                  </span>
                </div>
              )}
            </div>

            {/* 2. Formulir Kontrol Aturan Banyaknya Ruang */}
            <div className="space-y-4 pt-2">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                Pengaturan Parameter Banyaknya Ruang Ujian
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Box 1: Atur Target Jumlah Ruang Ujian */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      Target Banyaknya Ruang Ujian
                    </label>
                    <p className="text-2xs text-slate-500 mt-0.5">
                      Tentukan berapa banyak ruangan ujian yang dibuka dan digunakan secara serentak.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={targetRoomsInput}
                        onChange={(e) => setTargetRoomsInput(parseInt(e.target.value, 10) || 1)}
                        className="w-20 px-3 py-1.5 text-sm font-mono font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                      />
                      <span className="text-xs text-slate-600 font-medium">Ruang</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleApplyRoomCount(targetRoomsInput)}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-2xs"
                    >
                      Terapkan {targetRoomsInput} Ruang
                    </button>

                    <button
                      type="button"
                      onClick={handleApplyRecommendedRooms}
                      className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition-colors"
                      title="Gunakan rekomendasi POS berdasarkan total siswa"
                    >
                      POS: {recommendedRoomsCount} Ruang
                    </button>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-slate-200 text-2xs text-slate-600">
                    <span>Aksi Cepat:</span>
                    <button
                      type="button"
                      onClick={handleAddSingleRoomQuick}
                      className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-200 rounded font-medium text-slate-700 transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3 text-slate-500" />
                      <span>+1 Ruang</span>
                    </button>
                    {rooms.length > 1 && (
                      <button
                        type="button"
                        onClick={handleRemoveLastRoomQuick}
                        className="px-2 py-0.5 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 rounded font-medium text-rose-700 transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3 text-rose-500" />
                        <span>-1 Ruang Terakhir</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Box 2: Batas Ruang Fisik Sekolah */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      Batas Ketersediaan Ruang Fisik Sekolah
                    </label>
                    <p className="text-2xs text-slate-500 mt-0.5">
                      Batas kapasitas fasilitas gedung sekolah untuk pelaksanaan ujian serentak.
                    </p>
                  </div>

                  <div>
                    <label className="block text-2xs font-semibold text-slate-600 mb-1">
                      Batas Maks. Ruang Fisik Sekolah
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={formData.maxRoomsAllowed || 12}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            maxRoomsAllowed: parseInt(e.target.value, 10) || 12,
                          })
                        }
                        className="w-28 px-2.5 py-1.5 text-xs font-mono font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                      />
                      <span className="text-2xs text-slate-500 shrink-0">ruang fisik</span>
                    </div>
                  </div>

                  <p className="text-2xs text-slate-500 leading-relaxed">
                    Dengan {rooms.length} ruang aktif (1 pengawas per ruang), sekolah membutuhkan <strong>{rooms.length} pengawas ujian</strong> per hari.
                  </p>
                </div>
              </div>

              {/* Box 3: Aturan Metode Pembagian Siswa & Urutan Kelas */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <label className="block text-xs font-bold text-slate-800">
                      Aturan & Metode Pembagian Ruang Ujian
                    </label>
                    <span className="text-2xs font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">
                      Konfigurasi Alokasi
                    </span>
                  </div>
                  <p className="text-2xs text-slate-500 mt-0.5">
                    Pilih metode alokasi peserta: Berdasarkan Urutan Kelas, Silang Antar Kelas, atau Pengurutan NIS
                  </p>
                </div>

                {/* 5 Methods Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
                  <label
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                      (formData.sortMethod || 'class-order') === 'class-order'
                        ? 'bg-white border-slate-900 shadow-2xs ring-1 ring-slate-900'
                        : 'bg-white/60 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <GraduationCap className="w-3.5 h-3.5 text-slate-700" />
                        Urutan Kelas
                      </span>
                      <input
                        type="radio"
                        name="menuSortMethod"
                        checked={(formData.sortMethod || 'class-order') === 'class-order'}
                        onChange={() => setFormData({ ...formData, sortMethod: 'class-order' })}
                        className="text-slate-900 focus:ring-slate-900"
                      />
                    </div>
                    <span className="text-2xs font-bold text-indigo-700 mt-1">STANDAR SEKOLAH</span>
                    <p className="text-2xs text-slate-500 mt-1">
                      Mengisi ruang berurutan per rombongan belajar kelas (7A, 7B, dst).
                    </p>
                  </label>

                  <label
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                      formData.sortMethod === 'nis-cross-class'
                        ? 'bg-white border-slate-900 shadow-2xs ring-1 ring-slate-900'
                        : 'bg-white/60 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Shuffle className="w-3.5 h-3.5 text-slate-700" />
                        Silang Rombel
                      </span>
                      <input
                        type="radio"
                        name="menuSortMethod"
                        checked={formData.sortMethod === 'nis-cross-class'}
                        onChange={() => setFormData({ ...formData, sortMethod: 'nis-cross-class' })}
                        className="text-slate-900 focus:ring-slate-900"
                      />
                    </div>
                    <span className="text-2xs font-bold text-emerald-700 mt-1">ANTI MENCONTEK</span>
                    <p className="text-2xs text-slate-500 mt-1">
                      Menyilang siswa antar rombel bergantian di tiap ruang ujian.
                    </p>
                  </label>

                  <label
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                      formData.sortMethod === 'nis-asc'
                        ? 'bg-white border-slate-900 shadow-2xs ring-1 ring-slate-900'
                        : 'bg-white/60 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <ListOrdered className="w-3.5 h-3.5 text-slate-700" />
                        NIS Terkecil
                      </span>
                      <input
                        type="radio"
                        name="menuSortMethod"
                        checked={formData.sortMethod === 'nis-asc'}
                        onChange={() => setFormData({ ...formData, sortMethod: 'nis-asc' })}
                        className="text-slate-900 focus:ring-slate-900"
                      />
                    </div>
                    <span className="text-2xs font-semibold text-slate-600 mt-1">ASCENDING</span>
                    <p className="text-2xs text-slate-500 mt-1">
                      Siswa dialokasikan urut NIS nomor terkecil ke terbesar.
                    </p>
                  </label>

                  <label
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                      formData.sortMethod === 'nis-odd-even'
                        ? 'bg-white border-slate-900 shadow-2xs ring-1 ring-slate-900'
                        : 'bg-white/60 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-slate-700" />
                        Ganjil-Genap
                      </span>
                      <input
                        type="radio"
                        name="menuSortMethod"
                        checked={formData.sortMethod === 'nis-odd-even'}
                        onChange={() => setFormData({ ...formData, sortMethod: 'nis-odd-even' })}
                        className="text-slate-900 focus:ring-slate-900"
                      />
                    </div>
                    <span className="text-2xs font-semibold text-slate-600 mt-1">SELINGAN NIS</span>
                    <p className="text-2xs text-slate-500 mt-1">
                      Membagi siswa selang-seling digit akhir NIS ganjil dan genap.
                    </p>
                  </label>

                  <label
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                      formData.sortMethod === 'nis-desc'
                        ? 'bg-white border-slate-900 shadow-2xs ring-1 ring-slate-900'
                        : 'bg-white/60 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <ListOrdered className="w-3.5 h-3.5 text-slate-700" />
                        NIS Terbesar
                      </span>
                      <input
                        type="radio"
                        name="menuSortMethod"
                        checked={formData.sortMethod === 'nis-desc'}
                        onChange={() => setFormData({ ...formData, sortMethod: 'nis-desc' })}
                        className="text-slate-900 focus:ring-slate-900"
                      />
                    </div>
                    <span className="text-2xs font-semibold text-slate-600 mt-1">DESCENDING</span>
                    <p className="text-2xs text-slate-500 mt-1">
                      Siswa dialokasikan urut NIS terbesar (siswa angkatan terbaru).
                    </p>
                  </label>
                </div>

                {/* Sub-panel when class-order is selected */}
                {(formData.sortMethod || 'class-order') === 'class-order' && (
                  <div className="bg-white border border-indigo-200 rounded-lg p-3.5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          Urutan Prioritas Kelas (Masuk ke Ruang 01, 02, dst)
                        </span>
                        <span className="text-2xs text-slate-500">
                          {currentClassOrder.length} rombongan belajar terdeteksi dari data siswa
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleSortClassesAsc}
                          className="px-2 py-0.5 text-2xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-slate-700"
                        >
                          Urut A &rarr; Z
                        </button>
                        <button
                          type="button"
                          onClick={handleSortClassesDesc}
                          className="px-2 py-0.5 text-2xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-slate-700"
                        >
                          Urut Z &rarr; A
                        </button>
                        <button
                          type="button"
                          onClick={handleResetClassOrder}
                          className="px-2 py-0.5 text-2xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-slate-700"
                        >
                          Reset
                        </button>
                      </div>
                    </div>

                    {/* Class order items */}
                    <div className="flex flex-wrap items-center gap-2">
                      {currentClassOrder.map((clsName, idx) => (
                        <div
                          key={clsName}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-xs"
                        >
                          <span className="w-4 h-4 rounded-full bg-slate-900 text-white font-mono font-bold text-2xs flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-slate-800">{clsName}</span>
                          <span className="text-2xs text-slate-500 font-mono">
                            ({classStats[clsName] || 0} siswa)
                          </span>
                          <div className="flex items-center gap-0.5 ml-1 border-l border-slate-200 pl-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveClass(idx, 'up')}
                              className={`p-0.5 rounded ${
                                idx === 0 ? 'text-slate-300' : 'text-slate-600 hover:text-slate-900'
                              }`}
                              title="Pindahkan lebih awal"
                            >
                              <ChevronLeft className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === currentClassOrder.length - 1}
                              onClick={() => handleMoveClass(idx, 'down')}
                              className={`p-0.5 rounded ${
                                idx === currentClassOrder.length - 1
                                  ? 'text-slate-300'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                              title="Pindahkan lebih akhir"
                            >
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Secondary rules: sort inside & policy */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                      <div>
                        <label className="block text-2xs font-bold text-slate-700 mb-1">
                          Urutan Siswa Dalam Kelas
                        </label>
                        <select
                          value={formData.classSortInside || 'nis-asc'}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              classSortInside: e.target.value as 'nis-asc' | 'name-asc',
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                        >
                          <option value="nis-asc">Nomor Induk Siswa (NIS Naik)</option>
                          <option value="name-asc">Nama Lengkap Siswa (A - Z Sesuai Absen)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-2xs font-bold text-slate-700 mb-1">
                          Kebijakan Pengisian Kursi Ruang
                        </label>
                        <select
                          value={formData.classFillPolicy || 'continuous'}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              classFillPolicy: e.target.value as 'continuous' | 'separate-room',
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                        >
                          <option value="continuous">Berkelanjutan / Isi Penuh Kursi (Continuous)</option>
                          <option value="separate-room">Buka Ruang Baru Tiap Kelas (Separate Room)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Strategi Distribusi: Fill-First vs Even Distribution */}
                <div className="pt-2 border-t border-slate-200">
                  <label className="block text-xs font-bold text-slate-800 mb-2">
                    Strategi Pembebanan Ruangan
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                        (formData.roomDistributionMode || 'fill-first') === 'fill-first'
                          ? 'bg-white border-slate-900 shadow-2xs'
                          : 'bg-white/60 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="roomDistributionMode"
                        checked={(formData.roomDistributionMode || 'fill-first') === 'fill-first'}
                        onChange={() =>
                          setFormData({
                            ...formData,
                            roomDistributionMode: 'fill-first',
                          })
                        }
                        className="mt-0.5 text-slate-900 focus:ring-slate-900"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          Isi Penuh Berurutan (Sequential / Fill-First)
                        </span>
                        <p className="text-2xs text-slate-500 mt-0.5 leading-relaxed">
                          Ruang 01 diisi hingga kapasitas maksimum ({formData.defaultRoomCapacity} kursi), lalu sisa siswa dialokasikan ke Ruang 02, dst. Hemat penggunaan ruang dan pengawas jika peserta sedikit.
                        </p>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                        formData.roomDistributionMode === 'even-distribution'
                          ? 'bg-white border-slate-900 shadow-2xs'
                          : 'bg-white/60 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="roomDistributionMode"
                        checked={formData.roomDistributionMode === 'even-distribution'}
                        onChange={() =>
                          setFormData({
                            ...formData,
                            roomDistributionMode: 'even-distribution',
                          })
                        }
                        className="mt-0.5 text-slate-900 focus:ring-slate-900"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          Pemerataan Seimbang (Balanced / Even Distribution)
                        </span>
                        <p className="text-2xs text-slate-500 mt-0.5 leading-relaxed">
                          Beban siswa dibagi rata ke seluruh {rooms.length} ruang aktif (rata-rata ~{Math.round(students.length / Math.max(1, rooms.length))} siswa/ruang). Kepadatan kelas seragam dan jarak antar siswa lebih lega.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Aturan Standar Kursi Tiap Ruangan */}
            <div className="space-y-4 pt-2 border-t border-slate-200">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                Aturan & Standar Jumlah Kursi Tiap Ruangan
              </span>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    Kapasitas Standar per Ruang
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={formData.defaultRoomCapacity}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          defaultRoomCapacity: parseInt(e.target.value, 10) || 20,
                        })
                      }
                      className="w-24 px-3 py-1.5 text-sm font-mono font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                    />
                    <span className="text-xs text-slate-600">kursi / ruang</span>
                  </div>
                  <p className="text-2xs text-slate-500 leading-relaxed">
                    Standar POS Ujian umumnya menetapkan 20 s/d 24 kursi per ruang agar jarak antar siswa terjaga.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    Jumlah Kolom Tata Letak Meja
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="2"
                      max="6"
                      value={formData.defaultRoomColumns}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          defaultRoomColumns: parseInt(e.target.value, 10) || 4,
                        })
                      }
                      className="w-24 px-3 py-1.5 text-sm font-mono font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                    />
                    <span className="text-xs text-slate-600">kolom meja</span>
                  </div>
                  <p className="text-2xs text-slate-500 leading-relaxed">
                    Format 4 kolom (4 x 6 baris) atau 5 kolom memudahkan pengawas memantau seluruh baris.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    Batas Maksimal Kursi per Ruang
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="10"
                      max="80"
                      value={formData.maxSeatRule}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxSeatRule: parseInt(e.target.value, 10) || 30,
                        })
                      }
                      className="w-24 px-3 py-1.5 text-sm font-mono font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                    />
                    <span className="text-xs text-slate-600">maksimal kursi</span>
                  </div>
                  <p className="text-2xs text-slate-500 leading-relaxed">
                    Peringatan otomatis jika panitia memasukkan kapasitas melebihi ambang batas ini.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-2 text-amber-900">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Terapkan Serentak ke Semua Ruangan</span>
                    <p className="text-2xs text-amber-800 mt-0.5">
                      Klik tombol di samping untuk menyamakan kapasitas seluruh {rooms.length} ruang menjadi {formData.defaultRoomCapacity} kursi & {formData.defaultRoomColumns} kolom.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleApplyUniformCapacity}
                  className="px-4 py-2 font-bold text-xs bg-slate-900 text-white hover:bg-slate-800 rounded-md whitespace-nowrap shadow-xs transition-colors shrink-0"
                >
                  Terapkan ke Semua Ruang
                </button>
              </div>
            </div>

            {/* 4. Tabel Monitoring & Input Pengawas Per Hari, Ruang & Sesi */}
            <div className="pt-2">
              <DailyInvigilatorMatrix
                rooms={rooms}
                schedules={schedules}
                settings={{ ...settings, maxSeatRule: formData.maxSeatRule }}
                onSave={handleSaveDailyInvigilators}
                showRoomConfigColumns={true}
                title={`Daftar, Pengawas (Per Hari, Ruang & Sesi) & Konfigurasi ${rooms.length} Ruang Ujian Aktif`}
                subtitle={`Total Kapasitas: ${totalCapacity} kursi | Distribusi: ${(formData.roomDistributionMode || 'fill-first') === 'fill-first' ? 'Isi Penuh' : 'Pemerataan'} | Atur pengawas tiap hari, sesi ujian, dan tiap ruang di bawah ini.`}
              />
            </div>

            {/* Bottom Action Bar */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <span className="text-2xs text-slate-500">
                Aturan yang disimpan akan diterapkan ke seluruh modul alokasi, denah, kartu peserta, dan cetak dokumen.
              </span>
              <button
                type="button"
                onClick={() => handleSaveSettings()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-2xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Simpan Seluruh Aturan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. ATURAN IDENTITAS SEKOLAH UNTUK KOP (DUAL LOGO)        */}
      {/* ======================================================== */}
      {subTab === 'rules-kop' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Aturan Identitas Sekolah & Desain Kop Surat Resmi
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Konfigurasi kop surat resmi berlogo ganda: <strong>Logo Kiri (Pemda/Dinas)</strong> dan{' '}
                <strong>Logo Kanan (Sekolah)</strong>
              </p>
            </div>

            {/* Hidden File Inputs */}
            <input
              type="file"
              ref={fileInputPemdaRef}
              onChange={(e) => handleLogoUpload(e, 'pemda')}
              accept="image/*"
              className="hidden"
            />
            <input
              type="file"
              ref={fileInputSchoolRef}
              onChange={(e) => handleLogoUpload(e, 'school')}
              accept="image/*"
              className="hidden"
            />

            {/* Dual Logo Upload Boxes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Left Logo: PEMDA */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-900">
                      1. LOGO KIRI (PEMERINTAH DAERAH / DINAS)
                    </span>
                    <span className="text-2xs font-mono text-slate-500">Posisi: Kiri Kop</span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-lg border border-slate-300 bg-white p-2 flex items-center justify-center shrink-0 shadow-2xs">
                      <img
                        src={formData.logoLeftPemda || DEFAULT_PEMDA_LOGO}
                        alt="Logo Pemda"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <div className="space-y-1 text-xs">
                      <p className="font-semibold text-slate-800">Logo Pemda / Yayasan</p>
                      <p className="text-2xs text-slate-500">
                        Lambang Pemerintah Provinsi / Kabupaten / Dinas Pendidikan / Kemenag.
                      </p>
                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => fileInputPemdaRef.current?.click()}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-800 transition-colors"
                        >
                          <Upload className="w-3 h-3" />
                          <span>Ganti Logo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, logoLeftPemda: DEFAULT_PEMDA_LOGO }));
                            showFeedback('Logo Kiri dikembalikan ke default Pemda.');
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 border border-transparent rounded transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Logo: SEKOLAH */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-900">
                      2. LOGO KANAN (LOGO SATUAN PENDIDIKAN / SEKOLAH)
                    </span>
                    <span className="text-2xs font-mono text-slate-500">Posisi: Kanan Kop</span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-lg border border-slate-300 bg-white p-2 flex items-center justify-center shrink-0 shadow-2xs">
                      <img
                        src={formData.logoRightSchool || DEFAULT_SCHOOL_LOGO}
                        alt="Logo Sekolah"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <div className="space-y-1 text-xs">
                      <p className="font-semibold text-slate-800">Logo Resmi Sekolah</p>
                      <p className="text-2xs text-slate-500">
                        Lambang Tut Wuri Handayani atau Logo resmi SMA/SMK/SMP bersangkutan.
                      </p>
                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => fileInputSchoolRef.current?.click()}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-800 transition-colors"
                        >
                          <Upload className="w-3 h-3" />
                          <span>Ganti Logo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, logoRightSchool: DEFAULT_SCHOOL_LOGO }));
                            showFeedback('Logo Kanan dikembalikan ke default Sekolah.');
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 border border-transparent rounded transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* School Text Details */}
            <form onSubmit={(e) => handleSaveSettings(e, true)} className="space-y-4 text-xs pt-3 border-t border-slate-200">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Pemerintah Daerah / Yayasan (Baris 1 Kop)
                </label>
                <input
                  type="text"
                  required
                  value={formData.governmentName}
                  onChange={(e) => setFormData({ ...formData, governmentName: e.target.value.toUpperCase() })}
                  placeholder="Contoh: PEMERINTAH PROVINSI DAERAH KHUSUS IBUKOTA JAKARTA"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none uppercase font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Kegiatan Ujian / Asesmen *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.activityName || formData.examTitle}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        activityName: e.target.value,
                        examTitle: e.target.value,
                      })
                    }
                    placeholder="Contoh: Penilaian Akhir Semester (PAS) Ganjil"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tahun Ajaran (TA) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.academicYear}
                    onChange={(e) => setFormData({ ...formData, academicYear: e.target.value })}
                    placeholder="Contoh: 2026/2027"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Satuan Pendidikan / Sekolah (Baris 2 Utama Tebal)
                </label>
                <input
                  type="text"
                  required
                  value={formData.schoolName}
                  onChange={(e) => setFormData({ ...formData, schoolName: e.target.value.toUpperCase() })}
                  placeholder="Contoh: SMA NEGERI 1 TELADAN NUSANTARA"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-bold uppercase text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Alamat Lengkap Sekolah (Baris 3 Kop)
                </label>
                <input
                  type="text"
                  required
                  value={formData.schoolAddress}
                  onChange={(e) => setFormData({ ...formData, schoolAddress: e.target.value })}
                  placeholder="Contoh: Jl. Pemuda Pendidikan No. 45, Gambir, Jakarta Pusat"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">No. Telepon</label>
                  <input
                    type="text"
                    value={formData.schoolPhone}
                    onChange={(e) => setFormData({ ...formData, schoolPhone: e.target.value })}
                    placeholder="(021) 3840192"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Resmi</label>
                  <input
                    type="email"
                    value={formData.schoolEmail}
                    onChange={(e) => setFormData({ ...formData, schoolEmail: e.target.value })}
                    placeholder="info@sman1teladan.sch.id"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Website</label>
                  <input
                    type="text"
                    value={formData.schoolWebsite}
                    onChange={(e) => setFormData({ ...formData, schoolWebsite: e.target.value })}
                    placeholder="www.sman1teladan.sch.id"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kode Pos</label>
                  <input
                    type="text"
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    placeholder="10110"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* PEJABAT PENANDATANGAN, TEMPAT & TANGGAL DOKUMEN */}
              <div className="pt-4 border-t border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Pejabat Penandatangan, Tempat &amp; Tanggal Pengesahan Dokumen
                    </h3>
                    <p className="text-2xs text-slate-500 mt-0.5">
                      Otomatis tersinkron ke seluruh pratinjau &amp; ekspor PDF/Excel (Kartu Peserta, Jadwal Ujian, Daftar Hadir, Jurnal Harian, Berita Acara, Matriks Distribusi, serta Daftar &amp; Hadir Pengawas).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/70 border border-slate-200 rounded-lg p-4">
                  {/* Kepala Sekolah */}
                  <div className="space-y-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Nama Kepala Sekolah *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.headmaster}
                        onChange={(e) => setFormData({ ...formData, headmaster: e.target.value })}
                        placeholder="Contoh: Drs. H. Mulyadi, M.Pd."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        NIP Kepala Sekolah
                      </label>
                      <input
                        type="text"
                        value={formData.headmasterNip}
                        onChange={(e) => setFormData({ ...formData, headmasterNip: e.target.value })}
                        placeholder="Contoh: 19680315 199303 1 004 (atau -)"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  {/* Ketua Panitia */}
                  <div className="space-y-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Nama Ketua Panitia Ujian *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.committeeHead}
                        onChange={(e) => setFormData({ ...formData, committeeHead: e.target.value })}
                        placeholder="Contoh: Siti Rahmawati, S.Pd., M.Si."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        NIP Ketua Panitia
                      </label>
                      <input
                        type="text"
                        value={formData.committeeNip}
                        onChange={(e) => setFormData({ ...formData, committeeNip: e.target.value })}
                        placeholder="Contoh: 19750820 200212 2 001 (atau -)"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  {/* Tempat / Kota Penandatanganan */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-semibold text-slate-700">
                        Tempat / Kota Penandatanganan
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            signatureCity: extractCityFromAddress(formData.schoolAddress),
                          })
                        }
                        className="text-2xs font-semibold text-slate-600 hover:text-slate-900 underline"
                      >
                        Ambil dari Alamat
                      </button>
                    </div>
                    <input
                      type="text"
                      value={formData.signatureCity ?? ''}
                      onChange={(e) => setFormData({ ...formData, signatureCity: e.target.value })}
                      placeholder={`Otomatis: ${extractCityFromAddress(formData.schoolAddress)}`}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                    />
                    <p className="text-2xs text-slate-500 mt-1">
                      Jika dikosongkan, kota akan diambil otomatis dari bagian akhir Alamat Sekolah.
                    </p>
                  </div>

                  {/* Tanggal Penandatanganan */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-semibold text-slate-700">
                        Tanggal Penandatanganan / Pengesahan
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            signatureDate: '_____________________',
                          })
                        }
                        className="text-2xs font-semibold text-slate-600 hover:text-slate-900 underline"
                      >
                        Garis Kosong (_____)
                      </button>
                    </div>
                    <input
                      type="text"
                      value={formData.signatureDate ?? ''}
                      onChange={(e) => setFormData({ ...formData, signatureDate: e.target.value })}
                      placeholder="Contoh: 20 Oktober 2026 (atau kosongkan)"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                    />
                    <p className="text-2xs text-slate-500 mt-1">
                      Tampil di blok tanda tangan sebelah tempat/kota (misal: {extractCityFromSettings(formData)}, {extractSignatureDateFromSettings(formData)}).
                    </p>
                  </div>

                  {/* Rentang Tanggal Pelaksanaan Ujian */}
                  <div className="md:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Rentang Tanggal Pelaksanaan Ujian
                    </label>
                    <input
                      type="text"
                      value={formData.examDate}
                      onChange={(e) => setFormData({ ...formData, examDate: e.target.value })}
                      placeholder="Contoh: 20 - 25 Oktober 2026"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* UPLOAD TANDA TANGAN & STEMPEL SEKOLAH */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Unggah Tanda Tangan (TTD) &amp; Stempel Sekolah
                  </h3>
                  <p className="text-2xs text-slate-500 mt-0.5">
                    Format PNG (latar transparan disarankan) atau JPG maksimal 2MB. Otomatis tampil pada Kartu Peserta Ujian &amp; seluruh dokumen resmi PDF/Pratinjau.
                  </p>
                </div>

                {/* Hidden inputs for signatures and stamp */}
                <input
                  type="file"
                  ref={fileInputHeadmasterSigRef}
                  onChange={(e) =>
                    handleSignatureAssetUpload(e, 'headmasterSignature', 'TTD Kepala Sekolah')
                  }
                  accept="image/png,image/jpeg,image/webp,image/*"
                  className="hidden"
                />
                <input
                  type="file"
                  ref={fileInputCommitteeSigRef}
                  onChange={(e) =>
                    handleSignatureAssetUpload(e, 'committeeSignature', 'TTD Ketua Panitia')
                  }
                  accept="image/png,image/jpeg,image/webp,image/*"
                  className="hidden"
                />
                <input
                  type="file"
                  ref={fileInputStampRef}
                  onChange={(e) =>
                    handleSignatureAssetUpload(e, 'schoolStamp', 'Stempel Sekolah')
                  }
                  accept="image/png,image/jpeg,image/webp,image/*"
                  className="hidden"
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 1. TTD Kepala Sekolah */}
                  <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-900">
                          TTD Kepala Sekolah
                        </span>
                        <span className="text-3xs font-mono text-slate-500">Kartu &amp; Dokumen</span>
                      </div>
                      <div className="h-20 rounded-md border border-dashed border-slate-300 bg-white flex items-center justify-center p-2 overflow-hidden">
                        {formData.headmasterSignature ? (
                          <img
                            src={formData.headmasterSignature}
                            alt="TTD Kepala Sekolah"
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-2xs text-slate-400 text-center">
                            Belum ada TTD
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputHeadmasterSigRef.current?.click()}
                        className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 text-2xs font-semibold bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-800 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        <span>{formData.headmasterSignature ? 'Ganti TTD' : 'Unggah TTD'}</span>
                      </button>
                      {formData.headmasterSignature && (
                        <button
                          type="button"
                          onClick={() =>
                            handleClearSignatureAsset('headmasterSignature', 'TTD Kepala Sekolah')
                          }
                          className="p-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded transition-colors"
                          title="Hapus TTD Kepala Sekolah"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 2. TTD Ketua Panitia */}
                  <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-900">
                          TTD Ketua Panitia
                        </span>
                        <span className="text-3xs font-mono text-slate-500">Berita Acara &amp; Dokumen</span>
                      </div>
                      <div className="h-20 rounded-md border border-dashed border-slate-300 bg-white flex items-center justify-center p-2 overflow-hidden">
                        {formData.committeeSignature ? (
                          <img
                            src={formData.committeeSignature}
                            alt="TTD Ketua Panitia"
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-2xs text-slate-400 text-center">
                            Belum ada TTD
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputCommitteeSigRef.current?.click()}
                        className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 text-2xs font-semibold bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-800 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        <span>{formData.committeeSignature ? 'Ganti TTD' : 'Unggah TTD'}</span>
                      </button>
                      {formData.committeeSignature && (
                        <button
                          type="button"
                          onClick={() =>
                            handleClearSignatureAsset('committeeSignature', 'TTD Ketua Panitia')
                          }
                          className="p-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded transition-colors"
                          title="Hapus TTD Ketua Panitia"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 3. Stempel Sekolah */}
                  <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-900">
                          Stempel Sekolah
                        </span>
                        <span className="text-3xs font-mono text-slate-500">Kartu &amp; Pengesahan</span>
                      </div>
                      <div className="h-20 rounded-md border border-dashed border-slate-300 bg-white flex items-center justify-center p-2 overflow-hidden">
                        {formData.schoolStamp ? (
                          <img
                            src={formData.schoolStamp}
                            alt="Stempel Sekolah"
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-2xs text-slate-400 text-center">
                            Belum ada Stempel
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputStampRef.current?.click()}
                        className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 text-2xs font-semibold bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-800 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        <span>{formData.schoolStamp ? 'Ganti Stempel' : 'Unggah Stempel'}</span>
                      </button>
                      {formData.schoolStamp && (
                        <button
                          type="button"
                          onClick={() => handleClearSignatureAsset('schoolStamp', 'Stempel Sekolah')}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded transition-colors"
                          title="Hapus Stempel Sekolah"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* LIVE PREVIEW OF KOP SURAT & PENGESAHAN */}
              <div className="pt-4 space-y-3">
                <span className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Pratinjau Hasil Desain Kop Surat Resmi &amp; Blok Pengesahan Dokumen
                </span>

                <div className="bg-white border border-slate-300 p-6 rounded-lg shadow-xs space-y-5">
                  <div>
                    <div className="flex items-center justify-between gap-4 pb-3">
                      {/* Left: Pemda Logo */}
                      <div className="w-16 h-16 flex items-center justify-center shrink-0">
                        <img
                          src={formData.logoLeftPemda || DEFAULT_PEMDA_LOGO}
                          alt="Logo Pemda"
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>

                      {/* Center: Kop Typography */}
                      <div className="flex-1 text-center space-y-0.5">
                        <p className="text-xs font-semibold text-slate-900 tracking-wider">
                          {formData.governmentName || 'PEMERINTAH DAERAH'}
                        </p>
                        <h3 className="text-base sm:text-lg font-bold text-slate-950 tracking-tight font-serif uppercase">
                          {formData.schoolName || 'NAMA SATUAN PENDIDIKAN'}
                        </h3>
                        <p className="text-2xs text-slate-600">
                          {formData.schoolAddress}
                          {formData.schoolPhone ? ` | Telp: ${formData.schoolPhone}` : ''}
                          {formData.postalCode ? ` Kode Pos ${formData.postalCode}` : ''}
                        </p>
                        <p className="text-2xs text-slate-500 font-mono">
                          {formData.schoolEmail ? `Email: ${formData.schoolEmail}` : ''}
                          {formData.schoolWebsite ? ` | Website: ${formData.schoolWebsite}` : ''}
                        </p>
                      </div>

                      {/* Right: School Logo */}
                      <div className="w-16 h-16 flex items-center justify-center shrink-0">
                        <img
                          src={formData.logoRightSchool || DEFAULT_SCHOOL_LOGO}
                          alt="Logo Sekolah"
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    </div>

                    {/* Official Double Border Line Divider */}
                    <div className="w-full border-b-[3px] border-b-black border-double pt-1" />
                  </div>

                  {/* Preview of Footer Sign-off Block */}
                  <div className="pt-2 border-t border-dashed border-slate-200 grid grid-cols-2 gap-6 text-center text-xs text-slate-900">
                    <div>
                      <p className="text-slate-600">Mengetahui,</p>
                      <p className="font-semibold">Kepala Sekolah</p>
                      <OfficialSignatureGraphic
                        signatureUrl={formData.headmasterSignature}
                        stampUrl={formData.schoolStamp}
                        heightClass="h-14"
                      />
                      <p className="font-bold underline">{formData.headmaster || '-'}</p>
                      <p className="text-2xs font-mono text-slate-600">NIP. {formData.headmasterNip || '-'}</p>
                    </div>
                    <div>
                      <p className="text-slate-600">
                        {extractCityFromSettings(formData)}, {extractSignatureDateFromSettings(formData)}
                      </p>
                      <p className="font-semibold">Ketua Panitia Ujian</p>
                      <OfficialSignatureGraphic
                        signatureUrl={formData.committeeSignature}
                        heightClass="h-14"
                      />
                      <p className="font-bold underline">{formData.committeeHead || '-'}</p>
                      <p className="text-2xs font-mono text-slate-600">NIP. {formData.committeeNip || '-'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Identitas Kop &amp; Pengesahan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. TAMPILAN / PREVIEW DOKUMEN RESMI (A4 PAPER VIEW)      */}
      {/* ======================================================== */}
      {subTab === 'preview' && (() => {
        const isLandscapeDoc =
          previewDocType === 'attendance2' ||
          previewDocType === 'distribution-matrix' ||
          (previewDocType === 'invigilators' && invigilatorSubMode !== 'attendance-day');
        const pageCssSize = isLandscapeDoc
          ? `${activePaperSpec.heightMm}mm ${activePaperSpec.widthMm}mm`
          : `${activePaperSpec.widthMm}mm ${activePaperSpec.heightMm}mm`;
        const printMarginCss = previewDocType === 'door' ? '8mm' : '10mm';

        const doorSeatCount = Math.max(1, selectedRoom?.capacity || 24);
        const doorPrintablePx = (activePaperSpec.heightMm - 16) * 3.7795;
        const doorRowTargetPx = (doorPrintablePx - 255) / doorSeatCount;
        const doorDensity: 'spacious' | 'normal' | 'compact' | 'dense' | 'ultra' =
          doorRowTargetPx >= 32
            ? 'spacious'
            : doorRowTargetPx >= 26
              ? 'normal'
              : doorRowTargetPx >= 21.5
                ? 'compact'
                : doorRowTargetPx >= 17.5
                  ? 'dense'
                  : 'ultra';
        const isCompactDoor = previewDocType === 'door' && doorDensity !== 'spacious';
        const doorPaperMaxWidthClass =
          activePaperSpec.id === 'a4'
            ? 'max-w-[794px]'
            : 'max-w-[816px]';
        const doorPaperMinHeightClass =
          activePaperSpec.id === 'letter'
            ? 'min-h-[1056px]'
            : activePaperSpec.id === 'a4'
              ? 'min-h-[1123px]'
              : activePaperSpec.id === 'f4'
                ? 'min-h-[1247px]'
                : 'min-h-[1344px]';

        return (
        <div className="space-y-4">
          <style media="print">{`@page { size: ${pageCssSize}; margin: ${printMarginCss}; }`}</style>
          {/* Document Type Switcher Bar */}
          <div className="print:hidden bg-white border border-slate-200 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Pilih Dokumen:</span>
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
                <button
                  onClick={() => setPreviewDocType('door')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                    previewDocType === 'door'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <DoorOpen className="w-3.5 h-3.5 text-slate-600" />
                  <span>Tempelan Pintu</span>
                </button>

                <button
                  onClick={() => setPreviewDocType('seating')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                    previewDocType === 'seating'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-slate-600" />
                  <span>Denah Tempat Duduk</span>
                </button>

                <button
                  onClick={() => setPreviewDocType('attendance')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                    previewDocType === 'attendance'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-slate-600" />
                  <span>Daftar Hadir Ujian</span>
                </button>

                <button
                  onClick={() => setPreviewDocType('attendance2')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                    previewDocType === 'attendance2'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5 text-slate-600" />
                  <span>Daftar Hadir 2</span>
                </button>

                <button
                  onClick={() => setPreviewDocType('card')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                    previewDocType === 'card'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5 text-slate-600" />
                  <span>Kartu Peserta Ujian</span>
                </button>

                <button
                  onClick={() => setPreviewDocType('desk-card')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                    previewDocType === 'desk-card'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5 text-slate-600" />
                  <span>Kartu Meja</span>
                </button>

                <button
                  onClick={() => setPreviewDocType('journal')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                    previewDocType === 'journal'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ClipboardList className="w-3.5 h-3.5 text-slate-600" />
                  <span>Jurnal Harian Ruang</span>
                </button>

                <button
                  onClick={() => setPreviewDocType('handover')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                    previewDocType === 'handover'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-slate-600" />
                  <span>BA Serah Terima</span>
                </button>

                <button
                  onClick={() => setPreviewDocType('distribution-matrix')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                    previewDocType === 'distribution-matrix'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5 text-slate-600" />
                  <span>Matriks Distribusi</span>
                </button>

                <button
                  onClick={() => setPreviewDocType('invigilators')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                    previewDocType === 'invigilators'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5 text-slate-600" />
                  <span>Daftar &amp; Hadir Pengawas</span>
                </button>
              </div>
            </div>

            {/* Dynamic Selector & Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {(previewDocType === 'attendance' || previewDocType === 'attendance2') && (
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setAttendanceGroupingMode('per-room-class')}
                    className={`px-2 py-1 text-2xs font-bold rounded transition-colors ${
                      attendanceGroupingMode === 'per-room-class'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Per Ruang &amp; Kelas
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttendanceGroupingMode('per-room')}
                    className={`px-2 py-1 text-2xs font-bold rounded transition-colors ${
                      attendanceGroupingMode === 'per-room'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Per Ruang
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttendanceGroupingMode('per-class')}
                    className={`px-2 py-1 text-2xs font-bold rounded transition-colors ${
                      attendanceGroupingMode === 'per-class'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Per Kelas
                  </button>
                </div>
              )}

              {previewDocType === 'card' ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-600">Pilih Siswa:</span>
                  <select
                    value={selectedPreviewStudentId}
                    onChange={(e) => setSelectedPreviewStudentId(e.target.value)}
                    className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none max-w-[210px] truncate"
                  >
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nis} - {s.name} ({s.className})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (previewDocType === 'desk-card' && deskCardConfig.scope !== 'room') ||
                previewDocType === 'distribution-matrix' ||
                previewDocType === 'invigilators' ? null : (previewDocType === 'attendance' || previewDocType === 'attendance2') &&
                attendanceGroupingMode === 'per-class' ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-600">Pilih Kelas:</span>
                  <select
                    value={selectedAttendanceClass}
                    onChange={(e) => setSelectedAttendanceClass(e.target.value)}
                    className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                  >
                    {orderedClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        Kelas {cls} ({students.filter((s) => (s.className?.trim() || '') === cls).length} Siswa)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-600">Pilih Ruangan:</span>
                    <select
                      value={selectedPreviewRoomId}
                      onChange={(e) => setSelectedPreviewRoomId(e.target.value)}
                      className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                    >
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.code}) - {r.capacity} Kursi
                        </option>
                      ))}
                    </select>
                  </div>

                  {(previewDocType === 'attendance' || previewDocType === 'attendance2') &&
                    attendanceGroupingMode === 'per-room-class' && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-600">Kelas:</span>
                        <select
                          value={selectedAttendanceClass}
                          onChange={(e) => setSelectedAttendanceClass(e.target.value)}
                          className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                        >
                          {classesInSelectedRoom.map((cls) => {
                            const cnt = selectedRoom
                              ? students.filter(
                                  (s) =>
                                    s.roomId === selectedRoom.id &&
                                    (s.className?.trim() || '') === cls
                                ).length
                              : 0;
                            return (
                              <option key={cls} value={cls}>
                                {cls} ({cnt} Siswa)
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    )}

                  {previewDocType === 'seating' && examDayGroups.length > 0 && (
                    <>
                      {examDayGroups.length > 1 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-600">Hari:</span>
                          <select
                            value={selectedDayGroup?.dayKey || ''}
                            onChange={(e) => setSelectedDayKey(e.target.value)}
                            className="px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                          >
                            {examDayGroups.map((dg) => (
                              <option key={dg.dayKey} value={dg.dayKey}>
                                Hari {dg.dayNumber}: {dg.day}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {(selectedDayGroup?.sessions.length || 0) > 1 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-600">Sesi:</span>
                          <select
                            value={selectedSeatingScheduleId || selectedDayGroup?.sessions[0]?.id || ''}
                            onChange={(e) => setSelectedSeatingScheduleId(e.target.value)}
                            className="px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none max-w-[200px] truncate"
                          >
                            {selectedDayGroup?.sessions.map((sch, idx) => (
                              <option key={sch.id} value={sch.id}>
                                {getSessionDisplayLabel(sch, idx)} · {sch.subject}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Action buttons */}
              <button
                onClick={() => {
                  if (previewDocType === 'door' && selectedRoom) exportDoorPosterPdf(selectedRoom, students, settings);
                  if (previewDocType === 'attendance' && activeAttendanceTarget) {
                    const matchedSchedule = schedules.find(
                      (s) => s.id === attendanceConfig.scheduleId
                    );
                    exportAttendancePdfForTarget(activeAttendanceTarget, students, settings, {
                      dayDateText: attendanceConfig.dayDateText,
                      subjectText: attendanceConfig.subjectText,
                      cityLabel: attendanceConfig.cityLabel,
                      dateLine: attendanceConfig.dateLine,
                      invigilatorName: attendanceConfig.invigilatorName,
                      invigilatorNip: attendanceConfig.invigilatorNip,
                      subjectTeacherName: attendanceConfig.subjectTeacherName,
                      useDailyInvigilators: attendanceConfig.invigilatorName.trim() !== '',
                      schedule: matchedSchedule,
                    });
                  }
                  if (previewDocType === 'attendance2' && activeAttendanceTarget) {
                    exportAttendance2PdfForTarget(
                      activeAttendanceTarget,
                      examDayGroups,
                      students,
                      settings
                    );
                  }
                  if (previewDocType === 'seating') window.print();
                  if (previewDocType === 'card') {
                    if (selectedStudent) {
                      exportSingleStudentCardPdf(selectedStudent, settings, schedules);
                    } else {
                      exportExamCardsPdf(students, settings, schedules);
                    }
                  }
                  if (previewDocType === 'desk-card') {
                    exportDeskCardsPdf(students, rooms, settings, {
                      roomIdFilter:
                        deskCardConfig.scope === 'room' && selectedRoom
                          ? selectedRoom.id
                          : 'ALL',
                      classFilter:
                        deskCardConfig.scope !== 'room' ? deskCardConfig.classFilter : 'ALL',
                      cardsPerPage: deskCardConfig.cardsPerPage,
                      colorStyle: deskCardConfig.colorStyle,
                    });
                  }
                  if (previewDocType === 'journal' && selectedRoom && activeJournalRecord) {
                    exportDailyJournalPdf(
                      selectedRoom,
                      examDayGroups,
                      roomStudents,
                      settings,
                      activeJournalRecord,
                      journalBlankMode
                    );
                  }
                  if (previewDocType === 'handover' && selectedRoom && selectedDayGroup && activeHandoverRecord) {
                    exportHandoverBeritaAcaraPdf(
                      selectedRoom,
                      selectedDayGroup,
                      roomStudents,
                      settings,
                      activeHandoverRecord,
                      handoverDirectionMode,
                      handoverBlankMode
                    );
                  }
                  if (previewDocType === 'distribution-matrix') {
                    exportDistributionMatrixPdf(students, rooms, settings);
                  }
                  if (previewDocType === 'invigilators') {
                    if (invigilatorSubMode === 'schedule') {
                      exportInvigilatorSchedulePdf(rooms, schedules, settings);
                    } else if (invigilatorSubMode === 'attendance-multi') {
                      exportInvigilatorAttendancePdf(rooms, schedules, settings, {
                        mode: 'multi-day',
                      });
                    } else {
                      exportInvigilatorAttendancePdf(rooms, schedules, settings, {
                        mode: 'per-day',
                        dayKey: selectedDayGroup?.dayKey,
                      });
                    }
                  }
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-2xs"
                title="Unduh PDF Resmi Dokumen Ini"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {previewDocType === 'card'
                    ? 'Unduh Kartu PDF'
                    : previewDocType === 'desk-card'
                      ? 'Unduh Kartu Meja PDF'
                      : previewDocType === 'journal'
                        ? 'Unduh PDF (Ruang Ini)'
                        : previewDocType === 'attendance' || previewDocType === 'attendance2'
                          ? 'Unduh PDF (Lembar Ini)'
                          : previewDocType === 'handover'
                            ? 'Unduh BA PDF (Ruang & Hari Ini)'
                            : previewDocType === 'distribution-matrix'
                              ? 'Unduh Matriks PDF'
                              : previewDocType === 'invigilators'
                                ? invigilatorSubMode === 'schedule'
                                  ? 'Unduh Daftar Tugas PDF'
                                  : invigilatorSubMode === 'attendance-multi'
                                    ? 'Unduh Hadir & TTD PDF'
                                    : 'Unduh PDF (Hari Ini)'
                                : 'Unduh PDF'}
                </span>
              </button>

              {previewDocType === 'attendance' && (
                <>
                  <button
                    onClick={() => {
                      const matchedSchedule = schedules.find(
                        (s) => s.id === attendanceConfig.scheduleId
                      );
                      const useDaily = attendanceConfig.invigilatorName.trim() !== '';
                      exportBundledAttendancePdfForTargets(
                        allBundleTargetsForMode,
                        students,
                        settings,
                        {
                          dayDateText: attendanceConfig.dayDateText,
                          subjectText: attendanceConfig.subjectText,
                          cityLabel: attendanceConfig.cityLabel,
                          dateLine: attendanceConfig.dateLine,
                          invigilatorName:
                            attendanceGroupingMode === 'per-class' || !useDaily
                              ? attendanceConfig.invigilatorName
                              : undefined,
                          invigilatorNip:
                            attendanceGroupingMode === 'per-class' || !useDaily
                              ? attendanceConfig.invigilatorNip
                              : undefined,
                          subjectTeacherName: attendanceConfig.subjectTeacherName,
                          useDailyInvigilators: useDaily,
                          schedule: matchedSchedule,
                        },
                        attendanceGroupingMode === 'per-room-class'
                          ? 'Daftar_Hadir_Semua_Ruang_Kelas'
                          : attendanceGroupingMode === 'per-class'
                            ? 'Daftar_Hadir_Semua_Kelas'
                            : 'Daftar_Hadir_Semua_Ruang'
                      );
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors"
                    title={`Unduh seluruh ${allBundleTargetsForMode.length} lembar untuk mapel ini`}
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      {attendanceGroupingMode === 'per-room-class'
                        ? `Semua Ruang×Kelas (${allBundleTargetsForMode.length})`
                        : attendanceGroupingMode === 'per-class'
                          ? `Semua Kelas (${allBundleTargetsForMode.length})`
                          : `Semua Ruang (${allBundleTargetsForMode.length}R)`}
                    </span>
                  </button>
                  <button
                    onClick={() =>
                      exportAllSubjectsAttendancePdfForTargets(
                        allBundleTargetsForMode,
                        students,
                        settings,
                        schedules,
                        {
                          cityLabel: attendanceConfig.cityLabel,
                          dateLine: attendanceConfig.dateLine,
                          useDailyInvigilators: attendanceConfig.invigilatorName.trim() !== '',
                          subjectTeacherName: attendanceConfig.subjectTeacherName,
                        }
                      )
                    }
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors"
                    title={`Unduh bundel Daftar Hadir untuk ${allBundleTargetsForMode.length} lembar × ${schedules.length || 1} mata pelajaran`}
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Bundel Semua Mapel</span>
                  </button>
                </>
              )}

              {previewDocType === 'attendance2' && (
                <button
                  onClick={() =>
                    exportBundledAttendance2PdfForTargets(
                      allBundleTargetsForMode,
                      examDayGroups,
                      students,
                      settings,
                      attendanceGroupingMode === 'per-room-class'
                        ? 'Bundel_Daftar_Hadir_2_Ruang_Kelas'
                        : attendanceGroupingMode === 'per-class'
                          ? 'Bundel_Daftar_Hadir_2_Kelas'
                          : 'Bundel_Daftar_Hadir_2_Ruang'
                    )
                  }
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors"
                  title={`Unduh Bundel Daftar Hadir 2 (${allBundleTargetsForMode.length} Lembar)`}
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Bundel Semua ({allBundleTargetsForMode.length} Lembar)</span>
                </button>
              )}

              {previewDocType === 'card' && (
                <button
                  onClick={() => exportExamCardsPdf(students, settings, schedules)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors"
                  title="Unduh Seluruh Kartu Siswa"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden sm:inline">Semua Siswa</span>
                </button>
              )}

              {previewDocType === 'desk-card' && deskCardConfig.scope === 'room' && (
                <button
                  onClick={() =>
                    exportDeskCardsPdf(students, rooms, settings, {
                      roomIdFilter: 'ALL',
                      classFilter: 'ALL',
                      cardsPerPage: deskCardConfig.cardsPerPage,
                      colorStyle: deskCardConfig.colorStyle,
                    })
                  }
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors"
                  title="Unduh Kartu Meja untuk Semua Ruang"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden sm:inline">Semua Ruang ({rooms.length}R)</span>
                </button>
              )}

              {previewDocType === 'journal' && (
                <button
                  onClick={() =>
                    exportAllDailyJournalsPdf(
                      rooms,
                      examDayGroups,
                      students,
                      settings,
                      journalMap,
                      journalBlankMode
                    )
                  }
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors"
                  title={`Unduh Bundel Lengkap Jurnal (${rooms.length} Ruang)`}
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    Bundel Semua ({rooms.length} Ruang)
                  </span>
                </button>
              )}

              {previewDocType === 'handover' && (
                <button
                  onClick={() =>
                    exportAllHandoverBeritaAcaraPdf(
                      rooms,
                      examDayGroups,
                      students,
                      settings,
                      handoverMap,
                      handoverDirectionMode,
                      handoverBlankMode
                    )
                  }
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors"
                  title={`Unduh Bundel Lengkap BA Serah Terima (${rooms.length} Ruang × ${examDayGroups.length} Hari)`}
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    Bundel Semua ({rooms.length}R × {examDayGroups.length}H)
                  </span>
                </button>
              )}

              {previewDocType === 'invigilators' && invigilatorSubMode === 'attendance-day' && (
                <button
                  onClick={() =>
                    exportInvigilatorAttendancePdf(rooms, schedules, settings, {
                      mode: 'per-day',
                      dayKey: 'ALL',
                    })
                  }
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors"
                  title={`Unduh Bundel Daftar Hadir Pengawas (${examDayGroups.length} Hari)`}
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Bundel Semua Hari ({examDayGroups.length}H)</span>
                </button>
              )}

              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-md px-2 py-1">
                <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap">
                  Kertas:
                </span>
                <select
                  value={activePaperSpec.id}
                  onChange={(e) => handleChangePaperSize(e.target.value as PaperSize)}
                  className="text-xs font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
                  title="Pilih Ukuran Kertas Cetak (PDF & Browser Print)"
                >
                  {Object.values(PAPER_SIZE_OPTIONS).map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => window.print()}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors"
                title={`Cetak via Browser (${activePaperSpec.label})`}
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Cetak</span>
              </button>
            </div>
          </div>

          {/* Interactive Attendance Control Bar */}
          {previewDocType === 'attendance' && activeAttendanceTarget && (
            <AttendanceControlBar
              target={activeAttendanceTarget}
              schedules={schedules}
              settings={settings}
              config={attendanceConfig}
              onChangeConfig={setAttendanceConfig}
              onResetConfig={handleResetAttendanceConfig}
              isEditing={isEditingAttendance}
              onToggleEditing={() => setIsEditingAttendance((prev) => !prev)}
              studentsCount={attendanceTargetStudents.length}
            />
          )}

          {/* Interactive Day & Data Editor Bars for Jurnal Harian and BA Serah Terima */}
          {previewDocType === 'journal' && selectedRoom && activeJournalRecord && (
            <JournalControlBar
              room={selectedRoom}
              dayGroups={examDayGroups}
              settings={settings}
              record={activeJournalRecord}
              onChangeRecord={handleUpdateJournalRecord}
              onResetRecord={handleResetJournalRecord}
              onApplyCityToAllRooms={handleApplyCityToAllRooms}
              blankMode={journalBlankMode}
              onToggleBlankMode={setJournalBlankMode}
              isEditing={isEditingJournal}
              onToggleEditing={() => setIsEditingJournal((prev) => !prev)}
              roomStudentsCount={roomStudents.length}
            />
          )}

          {previewDocType === 'handover' && selectedRoom && selectedDayGroup && activeHandoverRecord && (
            <HandoverControlBar
              room={selectedRoom}
              dayGroups={examDayGroups}
              selectedDayGroup={selectedDayGroup}
              onSelectDayKey={setSelectedDayKey}
              record={activeHandoverRecord}
              onChangeRecord={handleUpdateHandoverRecord}
              onResetRecord={handleResetHandoverRecord}
              onApplyOfficerToAllRooms={handleApplyHandoverOfficerToAllRooms}
              directionMode={handoverDirectionMode}
              onChangeDirectionMode={setHandoverDirectionMode}
              blankMode={handoverBlankMode}
              onToggleBlankMode={setHandoverBlankMode}
              isEditing={isEditingHandover}
              onToggleEditing={() => setIsEditingHandover((prev) => !prev)}
              roomStudentsCount={roomStudents.length}
            />
          )}

          {previewDocType === 'desk-card' && (
            <DeskCardControlBar
              config={deskCardConfig}
              onChangeConfig={setDeskCardConfig}
              orderedClasses={orderedClasses}
              settings={settings}
              onChangeClassColor={handleChangeClassColor}
              onResetClassColors={handleResetClassColors}
              selectedRoom={selectedRoom}
              totalMatchingCards={deskCardStudents.length}
            />
          )}

          {previewDocType === 'invigilators' && (
            <InvigilatorControlBar
              subMode={invigilatorSubMode}
              onChangeSubMode={setInvigilatorSubMode}
              dayGroups={examDayGroups}
              selectedDayKey={selectedDayKey}
              onSelectDayKey={setSelectedDayKey}
            />
          )}

          <div className="print:hidden flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-700">
            <span>
              Ukuran Kertas Aktif:{' '}
              <strong className="text-slate-900">{activePaperSpec.label}</strong> (
              {isLandscapeDoc ? 'Landscape' : 'Portrait'})
            </span>
            <span className="text-slate-500">
              Berlaku otomatis untuk Unduh PDF maupun tombol Cetak Browser.
            </span>
          </div>

          {/* REALISTIC PAPER SHEET VIEWPORT */}
          <div className="bg-slate-200/70 p-4 sm:p-8 rounded-xl overflow-x-auto flex justify-center print:bg-white print:p-0 print:rounded-none print:overflow-visible">
            <div
              className={`bg-white shadow-xl border border-slate-300 w-full text-slate-900 font-sans print:shadow-none print:border-none print:p-0 print:max-w-none print:min-h-0 ${
                previewDocType === 'door'
                  ? `p-6 sm:p-8 ${doorPaperMaxWidthClass} ${doorPaperMinHeightClass} print:break-inside-avoid`
                  : isLandscapeDoc
                    ? 'p-8 sm:p-12 max-w-[1050px] min-h-[740px]'
                    : 'p-8 sm:p-12 max-w-[850px] min-h-[1100px]'
              }`}
            >
              {/* --- KOP SURAT RESMI BERSAMA DUA LOGO (Untuk Dokumen Pintu, Denah, Jurnal, dan BA) --- */}
              {previewDocType !== 'card' &&
                previewDocType !== 'desk-card' &&
                previewDocType !== 'attendance' &&
                previewDocType !== 'attendance2' && (
                <>
                  <div className={`flex items-center justify-between gap-4 ${isCompactDoor ? 'pb-2' : 'pb-3'}`}>
                    {/* Logo Kiri: Pemda */}
                    <div className={`${isCompactDoor ? 'w-11 h-11' : 'w-16 h-16'} flex items-center justify-center shrink-0`}>
                      <img
                        src={settings.logoLeftPemda || DEFAULT_PEMDA_LOGO}
                        alt="Logo Pemda"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>

                    {/* Kop Text */}
                    <div className="flex-1 text-center space-y-0.5">
                      <p className={`${isCompactDoor ? 'text-2xs' : 'text-xs'} font-bold text-slate-800 tracking-widest uppercase`}>
                        {settings.governmentName}
                      </p>
                      <h2 className={`${isCompactDoor ? 'text-base sm:text-lg' : 'text-lg sm:text-xl'} font-bold text-slate-950 font-serif tracking-tight uppercase`}>
                        {settings.schoolName}
                      </h2>
                      <p className="text-2xs text-slate-600">
                        {settings.schoolAddress}
                        {settings.schoolPhone ? ` | Telp: ${settings.schoolPhone}` : ''}
                        {settings.postalCode ? ` Kode Pos ${settings.postalCode}` : ''}
                      </p>
                      <p className="text-2xs text-slate-500 font-mono">
                        {settings.schoolEmail ? `Email: ${settings.schoolEmail}` : ''}
                        {settings.schoolWebsite ? ` | Website: ${settings.schoolWebsite}` : ''}
                      </p>
                    </div>

                    {/* Logo Kanan: Sekolah */}
                    <div className={`${isCompactDoor ? 'w-11 h-11' : 'w-16 h-16'} flex items-center justify-center shrink-0`}>
                      <img
                        src={settings.logoRightSchool || DEFAULT_SCHOOL_LOGO}
                        alt="Logo Sekolah"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  </div>

                  {/* Double Line Border */}
                  <div className={`w-full border-b-[3px] border-b-black border-double ${isCompactDoor ? 'mb-2.5' : 'mb-5'}`} />
                </>
              )}

              {/* ======================================================== */}
              {/* DOC 1 PREVIEW: TEMPELAN PINTU RUANG UJIAN                */}
              {/* ======================================================== */}
              {previewDocType === 'door' && (() => {
                const doorSpacingClass =
                  doorDensity === 'spacious'
                    ? 'space-y-3.5'
                    : doorDensity === 'normal'
                      ? 'space-y-2.5'
                      : doorDensity === 'compact'
                        ? 'space-y-2'
                        : 'space-y-1.5';
                const doorBannerPadClass =
                  doorDensity === 'spacious'
                    ? 'p-3.5 space-y-1'
                    : doorDensity === 'normal' || doorDensity === 'compact'
                      ? 'p-2.5 space-y-0.5'
                      : 'p-2 space-y-0.5';
                const doorTitleSizeClass =
                  doorDensity === 'spacious'
                    ? 'text-2xl'
                    : doorDensity === 'normal'
                      ? 'text-xl'
                      : 'text-lg';
                const doorRowCellClass =
                  doorDensity === 'spacious'
                    ? 'py-1.5 px-2.5 text-xs leading-snug'
                    : doorDensity === 'normal'
                      ? 'py-1 px-2.5 text-[11px] leading-tight'
                      : doorDensity === 'compact'
                        ? 'py-[3px] px-2 text-[10.5px] leading-tight'
                        : doorDensity === 'dense'
                          ? 'py-[2px] px-2 text-[10px] leading-tight'
                          : 'py-[1px] px-1.5 text-[9px] leading-tight';
                const doorHeadCellClass =
                  doorDensity === 'spacious'
                    ? 'py-2 px-2.5 text-xs'
                    : doorDensity === 'normal'
                      ? 'py-1.5 px-2.5 text-[11px]'
                      : doorDensity === 'compact'
                        ? 'py-1 px-2 text-[10.5px]'
                        : 'py-1 px-2 text-[10px]';

                return (
                <div className={`${doorSpacingClass} print:break-inside-avoid`}>
                  {/* Big Room Header Title */}
                  <div className={`bg-slate-900 text-white rounded-md text-center ${doorBannerPadClass}`}>
                    <span className="text-2xs uppercase tracking-widest text-slate-300 font-mono block">
                      DAFTAR TEMPELAN PINTU RUANG UJIAN
                    </span>
                    <h1 className={`${doorTitleSizeClass} font-bold tracking-tight`}>
                      {selectedRoom?.name.toUpperCase()} ({selectedRoom?.code})
                    </h1>
                    <p className="text-xs text-slate-300">
                      {settings.examTitle} &middot; Tahun Ajaran {settings.academicYear}
                    </p>
                  </div>

                  {/* Room Info Ribbon (Tanpa Sesi Ujian) */}
                  <div className={`grid grid-cols-3 gap-2 text-xs bg-slate-100 ${isCompactDoor ? 'p-2' : 'p-3'} rounded-md border border-slate-200`}>
                    <div>
                      <span className="text-2xs text-slate-500 block">LOKASI / GEDUNG</span>
                      <strong className="text-slate-900">{selectedRoom?.building}</strong>
                    </div>
                    <div>
                      <span className="text-2xs text-slate-500 block">ATURAN KAPASITAS</span>
                      <strong className="text-slate-900 font-mono">
                        {roomStudents.length} / {selectedRoom?.capacity} Kursi Terisi
                      </strong>
                    </div>
                    <div>
                      <span className="text-2xs text-slate-500 block">RENTANG NIS</span>
                      <strong className="text-slate-900 font-mono">
                        {roomStudents.length > 0
                          ? `${roomStudents[0].nis} - ${roomStudents[roomStudents.length - 1].nis}`
                          : '-'}
                      </strong>
                    </div>
                  </div>

                  {/* Notice Box for Students */}
                  <div className={`bg-amber-50 border border-amber-200 rounded ${isCompactDoor ? 'px-2.5 py-1.5' : 'p-2.5'} text-2xs text-amber-900 leading-snug`}>
                    <strong>Pemberitahuan Peserta:</strong> Denah di bawah mengikuti aturan kapasitas {selectedRoom?.capacity} meja ({selectedRoom?.columns} kolom). Pastikan Anda duduk di nomor meja yang sesuai dengan NIS dan Nomor Peserta. Harap siapkan Kartu Tanda Peserta sebelum memasuki ruangan.
                  </div>

                  {/* Table of Students conforming to Chair Rules */}
                  <div className="border border-slate-900 rounded overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-800 text-white font-semibold">
                        <tr>
                          <th className={`${doorHeadCellClass} text-center w-20 border-b border-r border-slate-700 whitespace-nowrap`}>No Meja</th>
                          <th className={`${doorHeadCellClass} border-b border-r border-slate-700 whitespace-nowrap`}>No. Peserta</th>
                          <th className={`${doorHeadCellClass} border-b border-r border-slate-700 whitespace-nowrap`}>NIS</th>
                          <th className={`${doorHeadCellClass} border-b border-r border-slate-700`}>Nama Lengkap Siswa</th>
                          <th className={`${doorHeadCellClass} border-b border-r border-slate-700 whitespace-nowrap`}>Kelas</th>
                          <th className={`${doorHeadCellClass} text-center w-10 border-b border-slate-700 whitespace-nowrap`}>L/P</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: selectedRoom?.capacity || 24 }).map((_, idx) => {
                          const seatNo = idx + 1;
                          const st = roomStudents.find((s) => s.seatNumber === seatNo);

                          if (st) {
                            return (
                              <tr key={seatNo} className="hover:bg-slate-50 border-b border-slate-700 last:border-b-0">
                                <td className={`${doorRowCellClass} text-center font-mono font-bold text-slate-900 bg-slate-100 border-r border-slate-700 whitespace-nowrap`}>
                                  Meja {String(seatNo).padStart(2, '0')}
                                </td>
                                <td className={`${doorRowCellClass} font-mono font-bold text-slate-900 border-r border-slate-700 whitespace-nowrap`}>
                                  {st.participantNo}
                                </td>
                                <td className={`${doorRowCellClass} font-mono text-slate-700 border-r border-slate-700 whitespace-nowrap`}>
                                  {st.nis}
                                </td>
                                <td className={`${doorRowCellClass} font-semibold text-slate-900 border-r border-slate-700`}>
                                  {st.name}
                                </td>
                                <td className={`${doorRowCellClass} text-slate-700 border-r border-slate-700 whitespace-nowrap`}>
                                  {st.className}
                                </td>
                                <td className={`${doorRowCellClass} text-center font-mono font-semibold whitespace-nowrap`}>
                                  {st.gender}
                                </td>
                              </tr>
                            );
                          }

                          return (
                            <tr key={seatNo} className="bg-slate-50/50 text-slate-400 border-b border-slate-700 last:border-b-0">
                              <td className={`${doorRowCellClass} text-center font-mono text-slate-400 border-r border-slate-700 whitespace-nowrap`}>
                                Meja {String(seatNo).padStart(2, '0')}
                              </td>
                              <td className={`${doorRowCellClass} font-mono border-r border-slate-700 whitespace-nowrap`}>-</td>
                              <td className={`${doorRowCellClass} font-mono border-r border-slate-700 whitespace-nowrap`}>-</td>
                              <td className={`${doorRowCellClass} italic text-slate-500 font-medium border-r border-slate-700`}>
                                [ KURSI KOSONG / TERSEDIA ]
                              </td>
                              <td className={`${doorRowCellClass} border-r border-slate-700 whitespace-nowrap`}>-</td>
                              <td className={`${doorRowCellClass} text-center whitespace-nowrap`}>-</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer note */}
                  <div className={`${isCompactDoor ? 'pt-2' : 'pt-3'} flex justify-between items-end text-xs text-slate-600 border-t border-slate-200`}>
                    <div>
                      <span className={isCompactDoor ? 'text-2xs' : 'text-xs'}>Dicetak dari Sistem Administrasi Ujian Resmi</span>
                      <p className="text-2xs text-slate-400">Harap ditempel di daun pintu masuk ruang ujian.</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xs text-slate-600">
                        {extractCityFromSettings(settings)}, {extractSignatureDateFromSettings(settings)}
                      </p>
                      <p className={`font-semibold text-slate-900 ${isCompactDoor ? 'text-2xs' : 'text-xs'}`}>{settings.schoolName}</p>
                      <p className="text-2xs">Ketua Panitia: {settings.committeeHead}</p>
                    </div>
                  </div>
                </div>
                );
              })()}

              {/* ======================================================== */}
              {/* DOC 2 PREVIEW: DENAH TEMPAT DUDUK (PHYSICAL SEAT GRID)   */}
              {/* ======================================================== */}
              {previewDocType === 'seating' && (() => {
                const seatingSessions = selectedDayGroup?.sessions || [];
                const activeSeatingSchedule =
                  seatingSessions.find((s) => s.id === selectedSeatingScheduleId) ||
                  seatingSessions[0];
                const seatingInvName =
                  selectedRoom && selectedDayGroup
                    ? getRoomDaySessionInvigilator(
                        selectedRoom,
                        selectedDayGroup.dayKey,
                        activeSeatingSchedule?.id,
                        settings
                      )
                    : selectedRoom?.invigilator1 || '';
                const seatingInvNip =
                  selectedRoom && selectedDayGroup
                    ? getRoomDaySessionInvigilatorNip(
                        selectedRoom,
                        selectedDayGroup.dayKey,
                        activeSeatingSchedule?.id,
                        settings
                      )
                    : selectedRoom?.invigilator1Nip || '';
                return (
                <div className="space-y-4">
                  <div className="text-center pb-2">
                    <h2 className="text-base font-bold text-slate-900 tracking-tight uppercase">
                      DENAH TATA LETAK TEMPAT DUDUK PESERTA
                    </h2>
                  </div>

                  {/* Blackboard & Invigilator Desk */}
                  <div className="space-y-2">
                    <div className="w-full bg-slate-800 text-white text-center py-2 rounded font-mono text-xs font-bold uppercase tracking-wider">
                      [ PAPAN TULIS DEPAN KELAS ]
                    </div>

                    <div className="w-64 mx-auto bg-amber-50 border border-amber-300 rounded p-2 text-center text-xs text-amber-900">
                      <strong>MEJA PENGAWAS RUANG</strong>
                      <p className="text-2xs truncate">
                        {seatingInvName || '-'}
                      </p>
                      {seatingInvNip && (
                        <p className="text-[10px] font-mono text-amber-800 truncate">
                          NIP. {seatingInvNip}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Class Color Legend (matching Desk Cards) */}
                  {classesInSelectedRoom.length > 0 && (
                    <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                      <span className="text-2xs font-bold text-slate-600 uppercase tracking-wide mr-1">
                        Warna Kelas:
                      </span>
                      {classesInSelectedRoom.map((cls) => {
                        const theme = getClassColorTheme(
                          cls,
                          orderedClasses,
                          settings.classColors
                        );
                        return (
                          <span
                            key={cls}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-2xs font-bold ${theme.badgeBgClass} ${theme.borderClass} ${theme.badgeTextClass}`}
                          >
                            <span className={`w-2 h-2 rounded-xs shrink-0 ${theme.swatchClass}`} />
                            <span>{cls}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Desk Grid */}
                  <div
                    className="grid gap-2.5 py-4"
                    style={{
                      gridTemplateColumns: `repeat(${selectedRoom?.columns || 4}, minmax(0, 1fr))`,
                    }}
                  >
                    {Array.from({ length: selectedRoom?.capacity || 24 }).map((_, idx) => {
                      const seatNo = idx + 1;
                      const student = roomStudents.find((s) => s.seatNumber === seatNo);

                      if (student) {
                        const theme = getClassColorTheme(
                          student.className,
                          orderedClasses,
                          settings.classColors
                        );
                        return (
                          <div
                            key={seatNo}
                            className={`border-2 ${theme.borderClass} ${theme.cardBgClass} rounded p-2 text-left shadow-2xs space-y-1`}
                          >
                            <div className={`flex items-center justify-between border-b ${theme.borderClass} pb-1`}>
                              <span className={`px-1.5 py-0.5 rounded font-mono text-2xs font-bold ${theme.seatBoxBgClass} ${theme.seatBoxTextClass}`}>
                                Meja {String(seatNo).padStart(2, '0')}
                              </span>
                              <span className={`px-1 rounded font-mono text-2xs font-bold ${theme.badgeBgClass} ${theme.badgeTextClass}`}>
                                ({student.gender})
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-950 truncate leading-tight" title={student.name}>
                              {student.name}
                            </p>
                            <div className="flex items-center justify-between text-2xs text-slate-700 font-mono gap-1">
                              <span>{student.nis}</span>
                              <span className={`px-1.5 py-0.5 rounded font-sans text-3xs font-bold truncate ${theme.badgeBgClass} ${theme.badgeTextClass}`}>
                                {student.className}
                              </span>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={seatNo}
                          className="border border-dashed border-slate-300 rounded p-2 text-left bg-white text-slate-300 flex flex-col justify-between"
                        >
                          <span className="font-mono text-2xs">Meja {String(seatNo).padStart(2, '0')}</span>
                          <span className="text-2xs text-center italic py-2">(Kosong)</span>
                          <span className="text-2xs text-slate-300 font-mono">Tersedia</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-center font-mono text-2xs text-slate-400 uppercase tracking-widest pt-2">
                    [ PINTU MASUK / BELAKANG KELAS ]
                  </div>

                  {/* Supervisor Signature Block */}
                  <div className="pt-6 flex justify-end text-center text-xs text-slate-800 pr-8">
                    <div>
                      <p>
                        {extractCityFromSettings(settings)}, {extractSignatureDateFromSettings(settings)}
                      </p>
                      <p>Mengetahui,</p>
                      <p className="font-bold">Pengawas Ruang</p>
                      <div className="h-14" />
                      <p className="font-bold underline">({seatingInvName || '.....................................'})</p>
                      {seatingInvNip && (
                        <p className="text-2xs font-mono">NIP. {seatingInvNip}</p>
                      )}
                    </div>
                  </div>
                </div>
                );
              })()}

              {/* ======================================================== */}
              {/* DOC 3 PREVIEW: DAFTAR HADIR PESERTA UJIAN (SESUAI FORMAT)*/}
              {/* ======================================================== */}
              {previewDocType === 'attendance' && activeAttendanceTarget && (
                <ExamAttendanceSheet
                  target={activeAttendanceTarget}
                  targetStudents={attendanceTargetStudents}
                  settings={settings}
                  config={attendanceConfig}
                />
              )}

              {/* ======================================================== */}
              {/* DOC 3B PREVIEW: DAFTAR HADIR 2 (REKAP MULTI-HARI)        */}
              {/* ======================================================== */}
              {previewDocType === 'attendance2' && activeAttendanceTarget && (
                <ExamAttendance2Sheet
                  target={activeAttendanceTarget}
                  dayGroups={examDayGroups}
                  targetStudents={attendanceTargetStudents}
                  settings={settings}
                />
              )}

              {/* ======================================================== */}
              {/* DOC 4 PREVIEW: KARTU PESERTA UJIAN                       */}
              {/* ======================================================== */}
              {previewDocType === 'card' && (
                <div className="space-y-6">
                  {/* Top info badge */}
                  <div className="print:hidden bg-slate-100 border border-slate-300 rounded p-2.5 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-slate-700" />
                      <span>
                        Format Cetak Standar: <strong>2 Kartu per Lembar Kertas {activePaperSpec.shortLabel}</strong> (Siap Potong &amp; Dilaminasi)
                      </span>
                    </div>
                    <span className="font-mono text-2xs text-slate-500">
                      Siswa Terpilih: <strong>{selectedStudent?.name}</strong> (NIS: {selectedStudent?.nis})
                    </span>
                  </div>

                  {/* Render 2 stacked cards as they would physically appear on the sheet */}
                  {[
                    selectedStudent,
                    students.find((s) => s.id !== selectedStudent?.id) || selectedStudent,
                  ].map((cardStudent, cardIdx) => {
                    if (!cardStudent) return null;
                    return (
                      <React.Fragment key={cardIdx}>
                        {/* The Exam Card Container (1,5 Spasi Kartu + Tabel Mapel 2 Spasi) */}
                        <div className="border-2 border-black rounded-lg p-5 bg-white shadow-2xs space-y-5">
                          {/* Card Kop Surat with Dual Logos */}
                          <div className="flex items-center justify-between gap-3 border-b-2 border-black pb-2.5">
                            {/* Logo Kiri Pemda */}
                            <div className="w-12 h-12 flex items-center justify-center shrink-0">
                              <img
                                src={settings.logoLeftPemda || DEFAULT_PEMDA_LOGO}
                                alt="Logo Pemda"
                                className="max-w-full max-h-full object-contain"
                              />
                            </div>

                            {/* Center Kop Typography */}
                            <div className="flex-1 text-center space-y-0.5">
                              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                                {settings.schoolName}
                              </h3>
                              <h2 className="text-sm font-black text-black uppercase tracking-wider font-serif">
                                KARTU PESERTA UJIAN
                              </h2>
                              <p className="text-2xs font-semibold text-slate-700 uppercase">
                                {settings.activityName || settings.examTitle} - TAHUN AJARAN {settings.academicYear}
                              </p>
                            </div>

                            {/* Logo Kanan Sekolah */}
                            <div className="w-12 h-12 flex items-center justify-center shrink-0">
                              <img
                                src={settings.logoRightSchool || DEFAULT_SCHOOL_LOGO}
                                alt="Logo Sekolah"
                                className="max-w-full max-h-full object-contain"
                              />
                            </div>
                          </div>

                          {/* Student Identity Grid & Photo (1.5 spasi) */}
                          <div className="flex gap-4 items-start">
                            {/* 2x3 Photo Box */}
                            <div className="w-20 h-26 rounded border-2 border-slate-800 bg-slate-50 flex flex-col items-center justify-center text-center overflow-hidden shrink-0">
                              {cardStudent.photoUrl ? (
                                <img
                                  src={cardStudent.photoUrl}
                                  alt={cardStudent.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="p-1 flex flex-col items-center justify-center">
                                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 mb-1">
                                    <Users className="w-4 h-4" />
                                  </div>
                                  <span className="text-3xs font-bold text-slate-600 uppercase">Pas Foto</span>
                                  <span className="text-3xs text-slate-500">2 x 3 cm</span>
                                </div>
                              )}
                            </div>

                            {/* Identity Fields */}
                            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2.5 leading-relaxed text-xs">
                              <div className="flex items-baseline">
                                <span className="w-24 text-slate-600 text-2xs">No. Peserta</span>
                                <span className="text-slate-500 mr-2 text-2xs">:</span>
                                <span className="font-mono font-bold text-black text-2xs">
                                  {cardStudent.participantNo || 'UJN-001'}
                                </span>
                              </div>

                              <div className="flex items-baseline">
                                <span className="w-24 text-slate-600 text-2xs">Ruang / Meja</span>
                                <span className="text-slate-500 mr-2 text-2xs">:</span>
                                <span className="font-mono font-bold text-black text-2xs">
                                  {cardStudent.roomName || 'Ruang 01'} (Meja {String(cardStudent.seatNumber || 1).padStart(2, '0')})
                                </span>
                              </div>

                              <div className="flex items-baseline">
                                <span className="w-24 text-slate-600 text-2xs">NIS / NISN</span>
                                <span className="text-slate-500 mr-2 text-2xs">:</span>
                                <span className="font-mono font-semibold text-black text-2xs">
                                  {cardStudent.nis} / {cardStudent.nisn || '-'}
                                </span>
                              </div>

                              <div className="flex items-baseline">
                                <span className="w-24 text-slate-600 text-2xs">Kelas / Rombel</span>
                                <span className="text-slate-500 mr-2 text-2xs">:</span>
                                <span className="font-semibold text-black text-2xs">
                                  {cardStudent.className}
                                </span>
                              </div>

                              <div className="flex items-baseline col-span-2">
                                <span className="w-24 text-slate-600 text-2xs">Nama Peserta</span>
                                <span className="text-slate-500 mr-2 text-2xs">:</span>
                                <span className="font-bold text-black uppercase text-xs">
                                  {cardStudent.name}
                                </span>
                              </div>

                              <div className="flex items-baseline">
                                <span className="w-24 text-slate-600 text-2xs">Jenis Kelamin</span>
                                <span className="text-slate-500 mr-2 text-2xs">:</span>
                                <span className="text-slate-900 text-2xs">
                                  {cardStudent.gender === 'L' ? 'Laki-Laki (L)' : 'Perempuan (P)'}
                                </span>
                              </div>

                              <div className="flex items-baseline">
                                <span className="w-24 text-slate-600 text-2xs">Sesi Ujian</span>
                                <span className="text-slate-500 mr-2 text-2xs">:</span>
                                <span className="text-slate-900 text-2xs">
                                  {settings.examSession}
                                </span>
                              </div>

                              <div className="flex items-baseline">
                                <span className="w-24 text-slate-600 text-2xs">Tanggal Ujian</span>
                                <span className="text-slate-500 mr-2 text-2xs">:</span>
                                <span className="text-slate-900 text-2xs font-medium">
                                  {settings.examDate || '-'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Timetable AutoTable with Bold Table Borders, 2 Spasi & Paraf Pengawas */}
                          <div className="border-2 border-black rounded overflow-hidden">
                            <table className="w-full text-left text-2xs border-collapse leading-loose">
                              <thead className="bg-slate-900 text-white font-semibold">
                                <tr>
                                  <th className="py-2.5 px-2 w-8 text-center border-b border-r border-slate-700">No</th>
                                  <th className="py-2.5 px-2 w-20 border-b border-r border-slate-700">Hari</th>
                                  <th className="py-2.5 px-2 w-32 border-b border-r border-slate-700">Tanggal</th>
                                  <th className="py-2.5 px-2 w-28 text-center border-b border-r border-slate-700">Waktu</th>
                                  <th className="py-2.5 px-2 border-b border-r border-slate-700">Mata Pelajaran Ujian</th>
                                  <th className="py-2.5 px-2 w-24 text-center bg-slate-800 border-b border-slate-700">
                                    Paraf Pengawas
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {getSchedulesForStudentCard(cardStudent, schedules).map((sch, schIdx) => (
                                  <tr key={sch.id} className="even:bg-slate-50 border-b border-black last:border-b-0">
                                    <td className="py-3.5 px-2 text-center font-mono font-bold text-slate-900 border-r border-black">
                                      {schIdx + 1}
                                    </td>
                                    <td className="py-3.5 px-2 font-semibold text-black border-r border-black whitespace-nowrap">
                                      {sch.day}
                                    </td>
                                    <td className="py-3.5 px-2 font-medium text-black border-r border-black whitespace-nowrap">
                                      {sch.date}
                                    </td>
                                    <td className="py-3.5 px-2 text-center font-mono text-black border-r border-black whitespace-nowrap">
                                      {sch.time}
                                    </td>
                                    <td className="py-3.5 px-2 font-semibold text-black border-r border-black">
                                      {sch.subject}
                                    </td>
                                    <td className="py-3.5 px-2 text-center">&nbsp;</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Bottom Right Official Headmaster Signature & School Stamp */}
                          <div className="pt-2 flex justify-end">
                            <div className="w-60 text-center text-2xs text-black leading-snug">
                              <p className="text-slate-700">
                                {extractCityFromSettings(settings)}, {extractSignatureDateFromSettings(settings)}
                              </p>
                              <p className="font-semibold">Kepala Sekolah,</p>
                              <OfficialSignatureGraphic
                                signatureUrl={settings.headmasterSignature}
                                stampUrl={settings.schoolStamp}
                                heightClass="h-14"
                              />
                              <p className="font-bold underline text-xs">{settings.headmaster || '-'}</p>
                              <p className="text-2xs font-mono text-slate-700">
                                NIP. {settings.headmasterNip || '-'}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Scissor Cutting Guideline Line between Card 1 and Card 2 */}
                        {cardIdx === 0 && (
                          <div className="py-2 flex items-center justify-center gap-2 text-2xs font-mono text-slate-500">
                            <span className="flex-1 border-b border-dashed border-slate-400" />
                            <span>✂ - - - - - - Gunting Di Sini - - - - - - ✂</span>
                            <span className="flex-1 border-b border-dashed border-slate-400" />
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}

              {/* ======================================================== */}
              {/* DOC 4B PREVIEW: KARTU MEJA PESERTA (WARNA PER KELAS)     */}
              {/* ======================================================== */}
              {previewDocType === 'desk-card' && (
                <DeskCardSheet
                  students={deskCardStudents}
                  rooms={rooms}
                  settings={settings}
                  orderedClasses={orderedClasses}
                  cardsPerPage={deskCardConfig.cardsPerPage}
                  colorStyle={deskCardConfig.colorStyle}
                  scopeLabel={
                    deskCardConfig.scope === 'room' && selectedRoom
                      ? selectedRoom.name
                      : deskCardConfig.classFilter !== 'ALL'
                        ? `Kelas ${deskCardConfig.classFilter}`
                        : 'Semua Ruang'
                  }
                />
              )}

              {/* ======================================================== */}
              {/* DOC 5 PREVIEW: JURNAL HARIAN TIAP RUANG                  */}
              {/* ======================================================== */}
              {previewDocType === 'journal' && selectedRoom && activeJournalRecord && (
                <ExamJournalSheet
                  room={selectedRoom}
                  dayGroups={examDayGroups}
                  roomStudents={roomStudents}
                  settings={settings}
                  record={activeJournalRecord}
                  blankMode={journalBlankMode}
                />
              )}

              {/* ======================================================== */}
              {/* DOC 6 PREVIEW: BERITA ACARA SERAH TERIMA (2 ARAH)        */}
              {/* ======================================================== */}
              {previewDocType === 'handover' && selectedRoom && selectedDayGroup && activeHandoverRecord && (
                <ExamHandoverSheet
                  room={selectedRoom}
                  dayGroup={selectedDayGroup}
                  roomStudents={roomStudents}
                  settings={settings}
                  record={activeHandoverRecord}
                  directionMode={handoverDirectionMode}
                  blankMode={handoverBlankMode}
                />
              )}

              {/* ======================================================== */}
              {/* DOC 7 PREVIEW: MATRIKS DISTRIBUSI PESERTA RUANG x KELAS  */}
              {/* ======================================================== */}
              {previewDocType === 'distribution-matrix' && (
                <DistributionMatrixSheet
                  students={students}
                  rooms={rooms}
                  settings={settings}
                />
              )}

              {/* ======================================================== */}
              {/* DOC 8 PREVIEW: DAFTAR TUGAS & KEHADIRAN PENGAWAS RUANG   */}
              {/* ======================================================== */}
              {previewDocType === 'invigilators' && (
                <InvigilatorScheduleAndAttendanceSheet
                  rooms={rooms}
                  schedules={schedules}
                  dayGroups={examDayGroups}
                  selectedDayGroup={selectedDayGroup}
                  settings={settings}
                  subMode={invigilatorSubMode}
                />
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};
