import {sql} from 'drizzle-orm';

export function optimizerMembersSql() {
  return sql`(SELECT json_group_array(json_array(id,member_no,name,christin_ranking,birth_year,gender,spouse_no,spouse_mode,suspended_event_id)) FROM (SELECT * FROM players ORDER BY id))`;
}

export function optimizerSignupsSql(eventId: number) {
  return sql`(SELECT json_group_array(json_array(id,player_id,availability,requested_hours,signup_order,status)) FROM (SELECT * FROM signups WHERE event_id=${eventId} ORDER BY id))`;
}

// Member and signup edits are allowed; plan/settings changes and member deletion are not.
export function optimizerScheduleSql() {
  return sql`json_array(
    (SELECT weights FROM optimizer_defaults WHERE id=1),
    (SELECT json_group_array(json_array(id,date,status,registration_opens_at,registration_closes_at,registration_schedule_custom,registration_override,imported_kampplan,is_test,test_active,archived)) FROM (SELECT * FROM events ORDER BY id)),
    (SELECT json_group_array(id) FROM (SELECT id FROM players ORDER BY id)),
    (SELECT json_group_array(json_array(id,event_id,court,start_time,player_ids,locked)) FROM (SELECT * FROM matches ORDER BY id))
  )`;
}
