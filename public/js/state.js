export const state = {
  // Auth & coliving context
  userId: null,
  userEmail: '',
  displayName: '',
  memberships: [],        // [{ colivingId, colivingName, role, linkedPersonId }]
  colivingId: null,       // active coliving
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
