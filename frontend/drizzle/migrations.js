// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_silly_riptide.sql';
import m0001 from './0001_add_bodyweight_kg.sql';
import m0002 from './0002_add_routine_superset_group.sql';
import m0003 from './0003_add_body_measurements.sql';
import m0004 from './0004_add_set_effort.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004
    }
  }
  