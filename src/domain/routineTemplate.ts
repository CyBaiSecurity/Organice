// Typed copy of the daily guide. The app does not read the Markdown file.

export const ROUTINE_ROLES = [
  'fixed',
  'school',
  'commute',
  'first-hour-at-home',
  'evening',
  'unconfirmed-meeting',
] as const;

export type RoutineRole = (typeof ROUTINE_ROLES)[number];

export const ROUTINE_PATTERN_IDS = ['mon_wed', 'tue_thu', 'fri', 'sat', 'sun'] as const;

export type RoutinePatternId = (typeof ROUTINE_PATTERN_IDS)[number];

export type RoutinePattern = {
  id: RoutinePatternId;
  label: string;
  weekdays: readonly number[];
};

export type RoutineBlockView = {
  id: string;
  pattern: RoutinePatternId;
  weekdays: readonly number[];
  sort: number;
  title: string;
  instructions: string;
  startMinute: number | null;
  endMinute: number | null;
  role: RoutineRole;
  enabled: boolean;
  remind: boolean;
};

export type RoutinePreview = {
  timeZone: 'Asia/Manila';
  patterns: (RoutinePattern & { blocks: RoutineBlockView[] })[];
};

type Seed = {
  id: string;
  weekdays?: readonly number[];
  sort: number;
  title: string;
  instructions: string;
  start: number | null;
  end: number | null;
  role: RoutineRole;
};

const clock = (hour: number, minute = 0): number => hour * 60 + minute;

export const ROUTINE_PATTERNS: readonly RoutinePattern[] = [
  { id: 'mon_wed', label: 'Monday and Wednesday', weekdays: [1, 3] },
  { id: 'tue_thu', label: 'Tuesday and Thursday', weekdays: [2, 4] },
  { id: 'fri', label: 'Friday', weekdays: [5] },
  { id: 'sat', label: 'Saturday', weekdays: [6] },
  { id: 'sun', label: 'Sunday', weekdays: [7] },
];

const MON_WED: readonly number[] = [1, 3];
const TUE_THU: readonly number[] = [2, 4];
const FRIDAY: readonly number[] = [5];
const SATURDAY: readonly number[] = [6];
const SUNDAY: readonly number[] = [7];

function patternBlocks(pattern: RoutinePatternId, weekdays: readonly number[], seeds: readonly Seed[]): RoutineBlockView[] {
  return seeds.map((seed) => ({
    id: seed.id,
    pattern,
    weekdays: seed.weekdays ?? weekdays,
    sort: seed.sort,
    title: seed.title,
    instructions: seed.instructions,
    startMinute: seed.start,
    endMinute: seed.end,
    role: seed.role,
    enabled: true,
    remind: false,
  }));
}

const MON_WED_BLOCKS = patternBlocks('mon_wed', MON_WED, [
  {
    id: 'mon-wed-wake',
    sort: 10,
    title: 'Wake up',
    instructions: 'Wake up. Send your girlfriend a good-morning update.',
    start: clock(6, 30),
    end: null,
    role: 'fixed',
  },
  {
    id: 'mon-wed-workout',
    sort: 20,
    title: 'Workout',
    instructions: 'Workout using your dumbbells and pull-up bar.',
    start: clock(6, 40),
    end: clock(7, 15),
    role: 'fixed',
  },
  {
    id: 'mon-wed-breakfast',
    sort: 30,
    title: 'Breakfast and prepare',
    instructions: 'Eat breakfast, shower, and prepare for school.',
    start: clock(7, 15),
    end: clock(8, 0),
    role: 'fixed',
  },
  {
    id: 'mon-wed-commute-in',
    sort: 40,
    title: 'Travel to school',
    instructions: 'Travel to school.',
    start: clock(8, 0),
    end: clock(10, 0),
    role: 'commute',
  },
  {
    id: 'mon-wed-class-morning',
    sort: 50,
    title: 'Class',
    instructions: 'Attend class. If there’s no class, work on your internship or practice Proxmox networking.',
    start: clock(10, 0),
    end: clock(12, 0),
    role: 'school',
  },
  {
    id: 'mon-wed-lunch',
    sort: 60,
    title: 'Lunch',
    instructions: 'Eat lunch and reply to your girlfriend and friends. Adjust this around your actual lunch break.',
    start: clock(12, 0),
    end: clock(13, 0),
    role: 'fixed',
  },
  {
    id: 'mon-wed-class-afternoon',
    sort: 70,
    title: 'Class',
    instructions: 'Attend class. Use free periods to continue the same task you started earlier.',
    start: clock(13, 0),
    end: clock(17, 0),
    role: 'school',
  },
  {
    id: 'mon-wed-commute-home',
    sort: 80,
    title: 'Travel home',
    instructions: 'Travel home. Leave earlier when classes end early.',
    start: null,
    end: null,
    role: 'commute',
  },
  {
    id: 'mon-wed-first-hour',
    sort: 90,
    title: 'First hour at home',
    instructions: 'Send an arrival update, eat dinner, wash, and do your chores.',
    start: null,
    end: null,
    role: 'first-hour-at-home',
  },
  {
    id: 'mon-wed-evening',
    sort: 100,
    title: 'Evening',
    instructions: 'Spend time with your girlfriend and relax.',
    start: null,
    end: null,
    role: 'evening',
  },
  {
    id: 'mon-meeting',
    weekdays: [1],
    sort: 110,
    title: 'Monday meeting',
    instructions:
      'Attend 7:00–8:00 pm when you’re home early. If class runs late, ask your boss to move it to 8:30–9:30 pm. Confirm a workable time if travel would still overlap. On that night, keep chores and your evening check-in short.',
    start: clock(19, 0),
    end: clock(20, 0),
    role: 'unconfirmed-meeting',
  },
  {
    id: 'mon-wed-prepare',
    sort: 120,
    title: 'Prepare for tomorrow',
    instructions: 'Prepare for tomorrow. Write down the first task you’ll do next.',
    start: clock(22, 0),
    end: clock(22, 30),
    role: 'fixed',
  },
  {
    id: 'mon-wed-sleep',
    sort: 130,
    title: 'Sleep',
    instructions: 'Aim to sleep.',
    start: clock(22, 30),
    end: null,
    role: 'fixed',
  },
]);

const TUE_THU_BLOCKS = patternBlocks('tue_thu', TUE_THU, [
  {
    id: 'tue-thu-wake',
    sort: 10,
    title: 'Wake up',
    instructions: 'Wake up and update your girlfriend.',
    start: clock(6, 0),
    end: null,
    role: 'fixed',
  },
  {
    id: 'tue-thu-breakfast',
    sort: 20,
    title: 'Breakfast and prepare',
    instructions: 'Eat breakfast, shower, and prepare.',
    start: clock(6, 15),
    end: clock(7, 0),
    role: 'fixed',
  },
  {
    id: 'tue-thu-choose-task',
    sort: 30,
    title: 'Choose the main task',
    instructions: 'Choose your main task for the day. If ready early, briefly review yesterday’s learning.',
    start: clock(7, 0),
    end: clock(7, 20),
    role: 'fixed',
  },
  {
    id: 'tue-thu-buffer',
    sort: 40,
    title: 'Departure buffer',
    instructions: 'Departure buffer.',
    start: clock(7, 20),
    end: clock(7, 30),
    role: 'fixed',
  },
  {
    id: 'tue-thu-commute-in',
    sort: 50,
    title: 'Travel to school',
    instructions: 'Travel to school.',
    start: clock(7, 30),
    end: clock(9, 0),
    role: 'commute',
  },
  {
    id: 'tue-class-morning',
    weekdays: [2],
    sort: 60,
    title: 'Class',
    instructions:
      'Attend class. Use free periods for internship work or Proxmox practice. On Tuesday, use one available 30-minute school break to search for suitable jobs or work on an application.',
    start: clock(9, 0),
    end: clock(12, 0),
    role: 'school',
  },
  {
    id: 'thu-class-morning',
    weekdays: [4],
    sort: 60,
    title: 'Class',
    instructions: 'Attend class. Use free periods for internship work or Proxmox practice.',
    start: clock(9, 0),
    end: clock(12, 0),
    role: 'school',
  },
  {
    id: 'tue-thu-lunch',
    sort: 70,
    title: 'Lunch',
    instructions: 'Lunch and updates, adjusted around class.',
    start: clock(12, 0),
    end: clock(13, 0),
    role: 'fixed',
  },
  {
    id: 'tue-thu-class-afternoon',
    sort: 80,
    title: 'Class',
    instructions: 'Attend class. Continue your selected task during free periods.',
    start: clock(13, 0),
    end: clock(17, 0),
    role: 'school',
  },
  {
    id: 'tue-thu-commute-home',
    sort: 90,
    title: 'Travel home',
    instructions: 'Travel home.',
    start: null,
    end: null,
    role: 'commute',
  },
  {
    id: 'tue-thu-first-hour',
    sort: 100,
    title: 'First hour at home',
    instructions: 'Dinner, washing, chores, and an arrival update.',
    start: null,
    end: null,
    role: 'first-hour-at-home',
  },
  {
    id: 'tue-thu-evening',
    sort: 110,
    title: 'Evening',
    instructions: 'Girlfriend time and relaxation.',
    start: null,
    end: null,
    role: 'evening',
  },
  {
    id: 'thu-meeting',
    weekdays: [4],
    sort: 115,
    title: 'Thursday meeting',
    instructions:
      'Follow the same arrangement as Monday: 7:00–8:00 pm, or 8:30–9:30 pm if your boss agrees. Confirm a workable time if travel would still overlap.',
    start: clock(19, 0),
    end: clock(20, 0),
    role: 'unconfirmed-meeting',
  },
  {
    id: 'tue-thu-prepare',
    sort: 120,
    title: 'Prepare for tomorrow',
    instructions: 'Prepare for tomorrow and wind down.',
    start: clock(22, 0),
    end: clock(22, 30),
    role: 'fixed',
  },
  {
    id: 'tue-thu-sleep',
    sort: 130,
    title: 'Sleep',
    instructions: 'Aim to sleep.',
    start: clock(22, 30),
    end: null,
    role: 'fixed',
  },
]);

const FRIDAY_BLOCKS = patternBlocks('fri', FRIDAY, [
  {
    id: 'fri-wake',
    sort: 10,
    title: 'Wake up',
    instructions: 'Wake up and update your girlfriend.',
    start: clock(7, 0),
    end: null,
    role: 'fixed',
  },
  {
    id: 'fri-workout',
    sort: 20,
    title: 'Workout',
    instructions: 'Workout.',
    start: clock(7, 15),
    end: clock(7, 50),
    role: 'fixed',
  },
  {
    id: 'fri-breakfast',
    sort: 30,
    title: 'Breakfast and shower',
    instructions: 'Breakfast and shower.',
    start: clock(7, 50),
    end: clock(8, 30),
    role: 'fixed',
  },
  {
    id: 'fri-internship',
    sort: 40,
    title: 'Internship and practice',
    instructions: 'Internship work and Proxmox networking practice.',
    start: clock(8, 30),
    end: clock(10, 0),
    role: 'fixed',
  },
  {
    id: 'fri-break',
    sort: 50,
    title: 'Break',
    instructions: 'Break and updates.',
    start: clock(10, 0),
    end: clock(10, 15),
    role: 'fixed',
  },
  {
    id: 'fri-jobs',
    sort: 60,
    title: 'Job search',
    instructions: 'Find suitable jobs or finish one tailored application.',
    start: clock(10, 15),
    end: clock(11, 15),
    role: 'fixed',
  },
  {
    id: 'fri-resume',
    sort: 70,
    title: 'Resume or portfolio',
    instructions: 'Update one part of your resume or portfolio using work you’ve actually completed.',
    start: clock(11, 15),
    end: clock(11, 45),
    role: 'fixed',
  },
  {
    id: 'fri-lunch',
    sort: 80,
    title: 'Lunch and chores',
    instructions: 'Lunch and chores.',
    start: clock(11, 45),
    end: clock(13, 0),
    role: 'fixed',
  },
  {
    id: 'fri-group-work',
    sort: 90,
    title: 'School group work',
    instructions: 'School group work if needed. Otherwise, use this for errands or rest.',
    start: clock(13, 0),
    end: clock(15, 0),
    role: 'school',
  },
  {
    id: 'fri-friends',
    sort: 100,
    title: 'People',
    instructions: 'Time to meet your girlfriend or spend time with friends or family.',
    start: clock(15, 0),
    end: clock(18, 0),
    role: 'fixed',
  },
  {
    id: 'fri-dinner',
    sort: 110,
    title: 'Dinner',
    instructions: 'Dinner.',
    start: clock(18, 0),
    end: clock(19, 0),
    role: 'fixed',
  },
  {
    id: 'fri-leisure',
    sort: 120,
    title: 'Leisure',
    instructions: 'Girlfriend time or leisure.',
    start: clock(19, 0),
    end: clock(21, 30),
    role: 'fixed',
  },
  {
    id: 'fri-prepare',
    sort: 130,
    title: 'Prepare for Saturday',
    instructions: 'Prepare for Saturday and relax.',
    start: clock(21, 30),
    end: clock(22, 30),
    role: 'fixed',
  },
  {
    id: 'fri-sleep',
    sort: 140,
    title: 'Sleep',
    instructions: 'Sleep.',
    start: clock(22, 30),
    end: clock(23, 0),
    role: 'fixed',
  },
]);

const SATURDAY_BLOCKS = patternBlocks('sat', SATURDAY, [
  {
    id: 'sat-morning',
    sort: 10,
    title: 'Wake and prepare',
    instructions: 'Wake up, update your girlfriend, eat, and prepare.',
    start: clock(7, 0),
    end: clock(8, 0),
    role: 'fixed',
  },
  {
    id: 'sat-work',
    sort: 20,
    title: 'Internship or networking',
    instructions:
      'Continue your internship or networking task. If you miss a workout, use Saturday morning and shorten that day’s work block.',
    start: clock(8, 0),
    end: clock(9, 30),
    role: 'fixed',
  },
  {
    id: 'sat-break',
    sort: 30,
    title: 'Break',
    instructions: 'Take a break.',
    start: clock(9, 30),
    end: clock(10, 0),
    role: 'fixed',
  },
  {
    id: 'sat-video',
    sort: 40,
    title: 'Video',
    instructions: 'Work on a video: choose one step—script, record, or edit.',
    start: clock(10, 0),
    end: clock(10, 45),
    role: 'fixed',
  },
  {
    id: 'sat-chores',
    sort: 50,
    title: 'Chores',
    instructions: 'Chores.',
    start: clock(10, 45),
    end: clock(11, 15),
    role: 'fixed',
  },
  {
    id: 'sat-free',
    sort: 60,
    title: 'Free time',
    instructions: 'Free time. Play guitar if you want.',
    start: clock(11, 15),
    end: clock(12, 0),
    role: 'fixed',
  },
  {
    id: 'sat-lunch',
    sort: 70,
    title: 'Lunch',
    instructions: 'Lunch.',
    start: clock(12, 0),
    end: clock(13, 0),
    role: 'fixed',
  },
  {
    id: 'sat-people',
    sort: 80,
    title: 'People',
    instructions: 'Girlfriend meetup, friends, family, or recreation.',
    start: clock(13, 0),
    end: clock(18, 0),
    role: 'fixed',
  },
  {
    id: 'sat-dinner',
    sort: 90,
    title: 'Dinner',
    instructions: 'Dinner.',
    start: clock(18, 0),
    end: clock(19, 0),
    role: 'fixed',
  },
  {
    id: 'sat-leisure',
    sort: 100,
    title: 'Leisure',
    instructions: 'Relationship time or leisure.',
    start: clock(19, 0),
    end: clock(21, 30),
    role: 'fixed',
  },
  {
    id: 'sat-wind-down',
    sort: 110,
    title: 'Wind down',
    instructions: 'Wind down.',
    start: clock(21, 30),
    end: clock(22, 30),
    role: 'fixed',
  },
  {
    id: 'sat-sleep',
    sort: 120,
    title: 'Sleep',
    instructions: 'Sleep.',
    start: clock(22, 30),
    end: clock(23, 0),
    role: 'fixed',
  },
]);

const SUNDAY_BLOCKS = patternBlocks('sun', SUNDAY, [
  {
    id: 'sun-morning',
    sort: 10,
    title: 'Slow morning',
    instructions: 'Wake up slowly, eat breakfast, and send updates.',
    start: clock(7, 0),
    end: clock(8, 30),
    role: 'fixed',
  },
  {
    id: 'sun-chores',
    sort: 20,
    title: 'Chores',
    instructions: 'Chores.',
    start: clock(8, 30),
    end: clock(9, 0),
    role: 'fixed',
  },
  {
    id: 'sun-rest',
    sort: 30,
    title: 'Rest',
    instructions: 'Rest, family, girlfriend time, or guitar.',
    start: clock(9, 0),
    end: clock(12, 0),
    role: 'fixed',
  },
  {
    id: 'sun-lunch',
    sort: 40,
    title: 'Lunch',
    instructions: 'Lunch.',
    start: clock(12, 0),
    end: clock(13, 0),
    role: 'fixed',
  },
  {
    id: 'sun-open',
    sort: 50,
    title: 'Open afternoon',
    instructions: 'Keep this open for rest and relationships.',
    start: clock(13, 0),
    end: clock(17, 0),
    role: 'fixed',
  },
  {
    id: 'sun-review',
    sort: 60,
    title: 'Review the week',
    instructions: 'Review the week: what got finished, what needs attention, and what felt too crowded?',
    start: clock(17, 0),
    end: clock(17, 15),
    role: 'fixed',
  },
  {
    id: 'sun-choose',
    sort: 70,
    title: 'Choose Monday’s task',
    instructions: 'Choose Monday’s first task and prepare your school things.',
    start: clock(17, 15),
    end: clock(17, 30),
    role: 'fixed',
  },
  {
    id: 'sun-evening',
    sort: 80,
    title: 'Evening',
    instructions: 'Dinner, girlfriend time, and relaxation.',
    start: clock(17, 30),
    end: clock(21, 30),
    role: 'fixed',
  },
  {
    id: 'sun-wind-down',
    sort: 90,
    title: 'Wind down',
    instructions: 'Wind down.',
    start: clock(21, 30),
    end: clock(22, 30),
    role: 'fixed',
  },
  {
    id: 'sun-sleep',
    sort: 100,
    title: 'Sleep',
    instructions: 'Aim to sleep.',
    start: clock(22, 30),
    end: null,
    role: 'fixed',
  },
]);

export const ROUTINE_TEMPLATE: readonly RoutineBlockView[] = [
  ...MON_WED_BLOCKS,
  ...TUE_THU_BLOCKS,
  ...FRIDAY_BLOCKS,
  ...SATURDAY_BLOCKS,
  ...SUNDAY_BLOCKS,
];

export function previewRoutineTemplate(): RoutinePreview {
  return {
    timeZone: 'Asia/Manila',
    patterns: ROUTINE_PATTERNS.map((pattern) => ({
      id: pattern.id,
      label: pattern.label,
      weekdays: pattern.weekdays,
      blocks: ROUTINE_TEMPLATE.filter((block) => block.pattern === pattern.id),
    })),
  };
}
