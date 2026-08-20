export interface ScheduleHoliday {
  id:   string;
  date: string;
  name: string;
}

export interface BusinessSchedule {
  id:                 string;
  name:               string;
  timeZoneName:       string;
  utcOffsetHours:     number;
  workingDaysMask:    number;
  workingDaysDisplay: string[];
  startHour:          number;
  endHour:            number;
  is24x7:             boolean;
  isDefault:          boolean;
  isActive:           boolean;
  holidays:           ScheduleHoliday[];
}

export interface SaveScheduleInput {
  name:           string;
  timeZoneName:   string;
  utcOffsetHours: number;
  workingDaysMask: number;
  startHour:      number;
  endHour:        number;
  is24x7:         boolean;
  isDefault:      boolean;
}

/** bit0=Lun … bit6=Dom (coincide con IsDefaultWorkingDay del backend). */
export const WEEK_DAYS: ReadonlyArray<{ label: string; bit: number }> = [
  { label: 'Lun', bit: 1 },  { label: 'Mar', bit: 2 },  { label: 'Mié', bit: 4 },
  { label: 'Jue', bit: 8 },  { label: 'Vie', bit: 16 }, { label: 'Sáb', bit: 32 },
  { label: 'Dom', bit: 64 },
];
