import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Split-and-index arithmetic on the stamped "YYYY-MM-DD" string plus a UTC-anchored Date used only
// for its day-of-week table lookup — never a call that resolves the READING device's own timezone
// (D-06, PITFALLS §12, mirrors history-query.ts's formatHistoryDate exactly). The label must read
// identically no matter which device or zone happens to open the editing screen.
function formatCalendarDayLabel(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAY_NAMES[weekdayIndex]}, ${MONTH_ABBREVIATIONS[month - 1]} ${day}`;
}

// The exact string the editing header renders (05-UI-SPEC §Session Modes) — a unit test asserts
// this format, so the header's wording is pinned independently of any rendering detail.
export function formatEditingHeader(localDate: string): string {
  return `Editing ${formatCalendarDayLabel(localDate)}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export interface SessionDateFieldViewProps {
  localDate: string;
  open: boolean;
  displayedYear: number;
  displayedMonth: number;
  colors: ThemeColors;
  onToggle: () => void;
  onNavigateMonth: (direction: -1 | 1) => void;
  onSelectDay: (day: number) => void;
}

// Hook-free — matches TextField/SelectField's label-above-control chrome. No numberOfLines
// anywhere: the date line wraps to a second line rather than truncating at large OS font scale
// (UI-SPEC E7, R4) — a truncated date read at a glance is exactly the "two modes look confusable"
// risk D-32 exists to prevent.
export function SessionDateFieldView({
  localDate,
  open,
  displayedYear,
  displayedMonth,
  colors,
  onToggle,
  onNavigateMonth,
  onSelectDay,
}: SessionDateFieldViewProps) {
  const [selectedYear, selectedMonth, selectedDay] = localDate.split('-').map(Number);
  const isDisplayingSelectedMonth = selectedYear === displayedYear && selectedMonth - 1 === displayedMonth;
  const total = daysInMonth(displayedYear, displayedMonth);
  const leadingBlanks = firstWeekdayOfMonth(displayedYear, displayedMonth);
  const cells: (number | null)[] = [
    ...(Array(leadingBlanks).fill(null) as null[]),
    ...Array.from({ length: total }, (_, index) => index + 1),
  ];

  return (
    <View className="gap-xs">
      <Text className="text-label font-normal text-foreground-muted">Date</Text>

      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel="Change session date"
        className={`flex-row items-center justify-between rounded-md border bg-surface px-md py-sm ${
          open ? 'border-accent' : 'border-foreground-muted'
        }`}
        style={{ minHeight: 48 }}
      >
        <Text className="text-body font-normal text-foreground">{formatCalendarDayLabel(localDate)}</Text>
        <Ionicons name="calendar-outline" size={18} color={colors.foregroundMuted} />
      </Pressable>

      {open ? (
        <View className="gap-sm rounded-md border border-foreground-muted bg-surface p-md">
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => onNavigateMonth(-1)}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              style={{ minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' }}
            >
              <Ionicons name="chevron-back" size={20} color={colors.foregroundMuted} />
            </Pressable>
            <Text className="text-body font-semibold text-foreground">
              {MONTH_NAMES[displayedMonth]} {displayedYear}
            </Text>
            <Pressable
              onPress={() => onNavigateMonth(1)}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              style={{ minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' }}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.foregroundMuted} />
            </Pressable>
          </View>

          <View className="flex-row flex-wrap">
            {cells.map((day, index) => {
              if (day === null) {
                return <View key={`blank-${index}`} style={{ width: '14.28%', height: 48 }} />;
              }
              const selected = isDisplayingSelectedMonth && day === selectedDay;
              return (
                <Pressable
                  key={day}
                  onPress={() => onSelectDay(day)}
                  accessibilityRole="button"
                  accessibilityLabel={`${MONTH_NAMES[displayedMonth]} ${day}, ${displayedYear}`}
                  accessibilityState={{ selected }}
                  style={{ width: '14.28%', height: 48, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text className={selected ? 'text-body font-semibold text-accent' : 'text-body font-normal text-foreground'}>
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export interface SessionDateFieldProps {
  localDate: string;
  onChange: (date: Date, timezone: string) => void;
}

// The stateful wrapper: owns the picker's open/closed state and which month it is currently
// displaying, initialised from (and reset to, on every open) the session's own current localDate —
// never the device's today. Selecting a day resolves the device's IANA timezone here, once, at the
// moment of selection (never inside setSessionDate itself — that function only ever receives an
// already-resolved timezone string, matching captureCalendarDay's own contract).
export function SessionDateField({ localDate, onChange }: SessionDateFieldProps) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const [displayed, setDisplayed] = useState(() => {
    const [year, month] = localDate.split('-').map(Number);
    return { year, month: month - 1 };
  });

  function handleToggle() {
    if (!open) {
      const [year, month] = localDate.split('-').map(Number);
      setDisplayed({ year, month: month - 1 });
    }
    setOpen((current) => !current);
  }

  function handleNavigateMonth(direction: -1 | 1) {
    setDisplayed((current) => {
      const next = current.month + direction;
      if (next < 0) return { year: current.year - 1, month: 11 };
      if (next > 11) return { year: current.year + 1, month: 0 };
      return { year: current.year, month: next };
    });
  }

  function handleSelectDay(day: number) {
    const date = new Date(displayed.year, displayed.month, day, 12, 0, 0);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setOpen(false);
    onChange(date, timezone);
  }

  return (
    <SessionDateFieldView
      localDate={localDate}
      open={open}
      displayedYear={displayed.year}
      displayedMonth={displayed.month}
      colors={colors}
      onToggle={handleToggle}
      onNavigateMonth={handleNavigateMonth}
      onSelectDay={handleSelectDay}
    />
  );
}
