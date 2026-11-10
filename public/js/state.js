export const state = {
  // Auth & coliving context
  userId: null,
  userEmail: '',
  colivingId: null,
  colivingName: '',
  isOwner: false,
  linkedPersonId: null,
  members: [],

  // App data
  people: [],
  trashQueue: [],
  trashCompletion: null,
  cleaningGroups: [],
  cleaningSettings: { start_date: null, start_group_id: null },
  cleaningPostponements: [],
  birthdays: [],
  vitalnyaBookings: [],
  currentTab: 'people',
  currentMonth: new Date(),
  scheduleMap: null,
};
